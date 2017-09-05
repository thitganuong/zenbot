var z = require('zero-fill')
  , n = require('numbro')

module.exports = function container (get, set, clear) {
  return {
    name: 'rsi',
    description: 'Attempts to buy low and sell high by tracking RSI high-water readings.',

    getOptions: function () {
      this.option('period', 'period length', String, '2m')
      this.option('min_periods', 'min. number of history periods', Number, 52)
      this.option('rsi_periods', 'number of RSI periods', 14)
      this.option('oversold_rsi', 'buy when RSI reaches or drops below this value', Number, 30)
      this.option('overbought_rsi', 'sell when RSI reaches or goes above this value', Number, 82)
      this.option('rsi_recover', 'allow RSI to recover this many points before buying', Number, 0)//3 -> 0
      this.option('rsi_drop', 'allow RSI to fall this many points before selling', Number, 0)
      this.option('rsi_divisor', 'sell when RSI reaches high-water reading divided by this value', Number, 2)
    },

    calculate: function (s) {
      get('lib.rsi')(s, 'rsi', s.options.rsi_periods)
      get('lib.rsi')(s, 'rsi_5', 5)
    },

    onPeriod: function (s, cb) {
     /* if (s.trend === 'long') {
        if(s.signal === 'buy'){
          if (s.options.diff >= s.options.diffBuyStop && s.period.rsi >=52 && s.period.rsi<= 90 && (s.last_trade_worth >= 0.05)) {
            s.trend = 'short'
            s.signal = 'sell'
            s.options.currentSignal = s.signal
            s.options.message = 'Case long buy o doan rsi 52-29, diff > diffbuystop sell ngat loi'
            console.log('\nCase 1')
          }
        }
      }*/

      if (s.in_preroll) return cb()

      if (typeof s.period.rsi === 'number') {
        if( s.options.actionShort == true){
          if (s.trend === 'short') {
            if(s.signal === 'sell'){
              if (s.options.diff >= s.options.diffBuyStop && s.period.rsi >=52 && s.period.rsi<= 59){
                s.trend = 'short'
                s.signal = 'buy'
                s.options.currentSignal = s.signal
                s.options.message = 'Case short buy o doan rsi 52-29, diff > diffbuystop'
                console.log('\nCase 2')
              }
            } else if(s.signal === 'buy'){
              if (s.options.diff < 0 &&  s.period.rsi< 50){//down trend ngat lo
                s.trend = 'short'
                s.signal = 'sell'
                s.options.currentSignal = s.signal
                s.options.message = 'Case short sell o doan rsi duoi 50'
                console.log('\nCase 3')
              } else if(s.options.diff > 0 && s.options.diff <3 &&  s.period.rsi > 62 &&  s.period.rsi < 75 ){ //uptrend len rsi 70 short sell ngat loi
                s.trend = 'short'
                s.signal = 'sell'
                s.options.currentSignal = s.signal
                s.options.message = 'Case short sell o doan rsi tren 62-75'
                console.log('\nCase 4')
              } else if(s.options.diff >= s.options.diffKeepStop &&  s.period.rsi > 70 ){ //uptrend len rsi 70  vaf diff manh se keep buy vao
                s.trend = 'short'
                s.options.currentSignal = s.signal
                s.options.message = 'Case short keep coin ko sell'
                console.log('\nCase 5')
              }
            }
          }
        }

        s.options.currentTrend = s.trend
        s.options.currentSignal = s.signal
        s.options.last_rsi = s.period.rsi

        console.log(('\nTEST s.period.rsi: ' +s.period.rsi ).red)
        console.log(('\nTEST s.period.rsi_5: ' +s.period.rsi_5 ).red)
        if(s.period.rsi == s.period.rsi_5 ){
            if(s.period.rsi_5 < s.options.last_rsi_5){
              s.signal = 'buy'
              console.log(('\nTEST Sell: ' +s.period.rsi_5 ).red)
            } else{
              s.signal = 'sell'
              console.log(('\nTEST BUY: ' +s.period.rsi_5 ).red)
            }
          console.log(('\nTEST trung s.period.rsi_5: ' +s.period.rsi_5 ).red)
        }

        s.options.last_rsi_5 = s.period.rsi_5
        console.log(('\ns.options.last_rsi:' +s.options.last_rsi).red)
        console.log(('\ns.options.last_rsi_5:' +s.options.last_rsi_5).red)
      }
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
