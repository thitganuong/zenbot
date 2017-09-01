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
      this.option('rsi_recover', 'allow RSI to recover this many points before buying', Number, 3)
      this.option('rsi_drop', 'allow RSI to fall this many points before selling', Number, 0)
      this.option('rsi_divisor', 'sell when RSI reaches high-water reading divided by this value', Number, 2)
    },

    calculate: function (s) {
      get('lib.rsi')(s, 'rsi', s.options.rsi_periods)
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
        if(s.trend === undefined){
          s.trend = s.options.trend
          s.rsi_low = s.options.rsi_low
          //  console.log('\nDefault rsi_low  was set to: ' + (s.rsi_low ) + '')
          s.rsi_high = s.options.rsi_high
          //  console.log('Default rsi_high was set to: ' + (s.rsi_high) + '')
          // console.log('Default trend was set to: ' + (s.trend) + '')
        }
        if(s.options.NeedRSI == true){
          s.rsi_low = s.options.rsi_low
          console.log('s.rsi_low  set to: ' + (s.rsi_low ) + '')
          s.rsi_high = s.options.rsi_high
          console.log('s.rsi_high was set to: ' + (s.rsi_high) + '')
          s.options.NeedRSI = false //set done thi tu off
        }
      }
      if(s.options.NeedSignal == true) {
        if (s.signal == undefined) {
          s.signal = s.options.signal
          console.log('s.signal was set to: ' + (s.signal) + '')
          s.options.NeedSignal = false // set done thi tu off
        }
      }

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

        if (s.trend !== 'oversold' && s.trend !== 'long' && s.period.rsi <= s.options.oversold_rsi) {
          s.rsi_low = s.period.rsi
          s.trend = 'oversold'
          s.options.isDownTrend = false
        }

        if (s.period.rsi >= 50){
          s.options.isDownTrend = false
        }
        /*if (s.trend === 'long' && s.options.diff <0 && s.period.rsi <= 40 && s.period.rsi >= 33) {
          s.trend = 'long'
          s.signal = 'sell'
          s.options.currentSignal = s.signal
          s.options.message = 'Case oversold sell coin ngat lo down trend'
          console.log('\nCase long oversold sell coin ngat lo down trend')
        }*/
        if (s.trend === 'oversold') {
          s.rsi_low = Math.min(s.rsi_low, s.period.rsi)
          if (s.period.rsi >= s.rsi_low + s.options.rsi_recover && s.options.isDownTrend == false) {
            s.trend = 'long'
            s.signal = 'buy'
            s.rsi_high = s.period.rsi
            s.options.currentSignal = s.signal
            s.options.message = 'Case oversold buy coin'
            console.log(('\nCase oversold buy coin').red)
          }
        }
        if (s.trend === 'long') {
          s.rsi_high = Math.max(s.rsi_high, s.period.rsi)
          /*if (s.period.rsi <= 40) {
            s.trend = 'short'
            s.signal = 'sell'
            s.options.currentSignal = s.signal
            s.options.message = 'Case long sell coin ngat lo down trend'
          }*/
          console.log('\nCurrent s.period.rsi:' +s.period.rsi)
          if(s.options.last_rsi - s.period.rsi  >= 10 && s.period.rsi >=30){
            s.trend = 'long'
            s.signal = 'sell'
            s.options.currentSignal = s.signal
            s.options.isDownTrend = true
            s.options.message = 'Case long sell coin ngat lo sri down 10'
            console.log(('\nCase long sell coin ngat lo sri down 10').red)
          }
          if (s.period.rsi <= s.rsi_high / s.options.rsi_divisor) {
            s.trend = 'short'
            s.signal = 'sell'
            s.options.currentSignal = s.signal
            s.options.message = 'Case long sell coin ngat lo'
            console.log(('\nCase long sell coin ngat lo').red)
          }
        }
        if ((s.trend ==='short' ||s.trend === 'long') && s.period.rsi >= s.options.overbought_rsi) {
          s.rsi_high = s.period.rsi
          s.trend = 'overbought'
        }
        if (s.trend === 'overbought') {
          s.rsi_high = Math.max(s.rsi_high, s.period.rsi)
          if (s.period.rsi <= s.rsi_high - s.options.rsi_drop) {
            s.trend = 'short'
            s.signal = 'sell'
            s.options.currentSignal = s.signal
            s.options.message = 'Case overbought sell coin ngat loi'
            console.log(('\nCase overbought sell coin ngat loi').red)
          }
        }
        s.options.currentTrend = s.trend
        s.options.last_rsi = s.period.rsi
        console.log('\ns.options.isDownTrend :' +s.options.isDownTrend)
        console.log('\ns.options.currentTrend:' +s.options.currentTrend)
        console.log(('\ns.options.last_rsi:' +s.options.last_rsi).red)
       
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
