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
	if (typeof s.period.rsi === 'number') {
		if(s.trend === undefined){
          s.trend = s.options.trend
          s.rsi_low = s.options.rsi_low
		  console.log('\nDefault rsi_low  was set to: ' + (s.rsi_low ) + '')
		  s.rsi_high = s.options.rsi_high
		  console.log('Default rsi_high was set to: ' + (s.rsi_high) + '')
          console.log('Default trend was set to: ' + (s.trend) + '')
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
      if (s.in_preroll) return cb()
      if (typeof s.period.rsi === 'number') {
		if (s.trend === 'short') {
			if(s.signal === 'sell'){
			  if (s.options.diff >= s.options.diffBuyStop && s.period.rsi >=52 && s.period.rsi<= 59){
				s.trend = 'short'
				s.signal = 'buy'
          s.options.currentSignal = s.signal
			  }
		   } else if(s.signal === 'buy'){
			  if (s.options.diff < 0 &&  s.period.rsi< 50){//down trend ngat lo
				s.trend = 'short'
				s.signal = 'sell'
          s.options.currentSignal = s.signal
			  } else if(s.options.diff > 0 && s.options.diff <3 &&  s.period.rsi > 62 &&  s.period.rsi < 75 ){ //uptrend len rsi 70 short sell ngat loi
				 s.trend = 'short'
				s.signal = 'sell'
          s.options.currentSignal = s.signal
      } else if(s.options.diff >= s.options.diffKeepStop &&  s.period.rsi > 70 ){ //uptrend len rsi 70  vaf diff manh se keep buy vao
				 s.trend = 'short'
          s.options.currentSignal = s.signal
			  }
		   }
		}

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
            s.options.currentSignal = s.signal
          }
        }
        if (s.trend === 'long') {
          s.rsi_high = Math.max(s.rsi_high, s.period.rsi)
          if (s.period.rsi <= s.rsi_high / s.options.rsi_divisor) {
            s.trend = 'short'
            s.signal = 'sell'
            s.options.currentSignal = s.signal
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
            s.options.currentSignal = s.signal
          }
        }
        s.options.currentTrend = s.trend
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
