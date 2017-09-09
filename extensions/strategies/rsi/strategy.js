var z = require('zero-fill')
  , n = require('numbro')

module.exports = function container (get, set, clear) {
  return {
    name: 'rsi',
    description: 'Attempts to buy low and sell high by tracking RSI high-water readings.',

    getOptions: function () {
      this.option('period', 'period length', String, '2m')
      this.option('min_periods', 'min. number of history periods', Number, 52)
      this.option('rsi_periods', 'number of RSI periods', 200)
      this.option('oversold_rsi', 'buy when RSI reaches or drops below this value', Number, 46.5)
      this.option('overbought_rsi', 'sell when RSI reaches or goes above this value', Number, 57)
      this.option('rsi_recover', 'allow RSI to recover this many points before buying', Number, 0)
      this.option('rsi_drop', 'allow RSI to fall this many points before selling', Number, 0)
      this.option('rsi_dividend', 'sell when RSI reaches high-water reading divided by this value', Number, 2)
    },

    calculate: function (s) {
      get('lib.rsi')(s, 'rsi', s.options.rsi_periods)
      get('lib.rsi')(s, 'rsi_5', 14)
    },

    onPeriod: function (s, cb) {
      if (s.in_preroll) return cb()
      if (typeof s.period.rsi === 'number') {
       /* console.log(('\ns.options.currentRSI14 ' + s.options.currentRSI14).red)
        console.log(('\nlast signal ' + s.options.last_trade_type).red)
        console.log(('\nMax Price now: ' + s.options.markMaxPriceFromBuy).red)

        if(s.options.last_trade_type == 'buy' &&  s.options.diffPrice >=4){
          s.signal = 'sell'
          console.log(('\nMaxPrice doelsewn 4% SELL at: ' + s.options.diffPrice).red)
        }
        if(s.options.last_trade_type == 'sell' /!*&& s.period.rsi >= 51*!/ & s.period.rsi_5 <=12){
          s.signal = 'buy'
          console.log(('\nBuy at oversold RSI 14').red)
        }*/

        /*
                if (s.trend === 'short') {
                    if(s.options.last_trade_type == 'sell' && s.period.rsi >= 51 && s.period.rsi_5 >=11 && s.period.rsi_5<=12.5){
                      s.signal = 'buy'
                    } else if (s.period.rsi_5 >=65 && s.period.rsi_5 <=100 && s.options.currentRSI14- s.period.rsi_5 >=5 && s.options.last_trade_type == 'buy'){
                     s.signal = 'sell'
                    }
                }
        */

        if (s.trend !== 'oversold' && s.trend !== 'long' && s.period.rsi <= s.options.oversold_rsi) {
          s.rsi_low = s.period.rsi
          s.trend = 'oversold'
        }
        if (s.trend === 'oversold') {
          s.rsi_low = Math.min(s.rsi_low, s.period.rsi)
          if (s.period.rsi >= s.rsi_low + s.options.rsi_recover) {
            s.trend = 'long'
            s.signal = 'buy'
            s.rsi_high = s.period.rsi
            console.log(('\noversold ' + s.period.rsi).red)
          }
        }

        if (s.trend === 'long') {
          s.rsi_high = Math.max(s.rsi_high, s.period.rsi)
          /*if(s.period.rsi_5 >=75 && s.period.rsi_5 <=100 && s.options.currentRSI14 - s.period.rsi_5 >=5 && s.options.last_trade_type == 'buy'){
            s.signal = 'sell'
            s.options.needBuyatLowerPrice_Long = true
          } else if(s.options.needBuyatLowerPrice_Long == true && s.period.rsi <=50){
            s.trend = 'short'
            s.options.needBuyatLowerPrice_Long = false
          }*/

          if (s.period.rsi <= s.rsi_high / s.options.rsi_dividend) {
            s.trend = 'short'
            s.signal = 'sell'
          }

        }

        if (s.trend === 'long' && s.period.rsi >= s.options.overbought_rsi) {
          s.rsi_high = s.period.rsi
          s.trend = 'overbought'
        }
        if (s.trend === 'overbought') {
          s.rsi_high = Math.max(s.rsi_high, s.period.rsi)
          if (s.period.rsi <= s.rsi_high - s.options.rsi_drop) {
            s.trend = 'short'
            s.signal = 'sell'
            console.log(('\noverbought ' + s.period.rsi).red)
          }
        }
      }
    /*  if (s.period.rsi >= 50) {
        s.signal = 'buy'
      } else {
        s.signal = 'sell'
      }*/
      s.options.currentRSI14=s.period.rsi_5
      s.options.currentRSI=s.period.rsi
      console.log(('\nTrend: ' + s.trend).red)
      console.log(('\ns.period.rsi ' + s.period.rsi).red)
      console.log(('\ns.period.rsi_5 ' + s.period.rsi_5).red)
      cb()
    },

    onReport: function (s) {
      var cols = []
      if (typeof s.period.rsi === 'number') {
        var color = 'grey'
        if (s.period.rsi <= s.options.oversold_rsi) {
          color = 'green'
        }
        cols.push(z(4, n(s.period.rsi).format('0'), ' ')[color])
      }
      return cols
    }
  }
}
