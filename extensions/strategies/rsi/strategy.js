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
      if (s.in_preroll) return cb()
      if (typeof s.period.rsi === 'number') {
        if(s.trend === undefined){
         
         if(s.rsi_firstRun !== undefined){
              s.rsi_high = Math.max(s.rsi_high, s.period.rsi)
               
              if(s.rsi_high < 70){
               
              var diffRsi =  s.rsi_high - s.rsi_firstRun
              if(diffRsi > 10){
                  s.trend = 'long'
                  s.signal = 'buy'
              }
             }
          }else{
            s.rsi_firstRun = s.period.rsi
            s.rsi_high = s.period.rsi
            s.rsi_low = 25
          }
          
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
              }
            } else if(s.signal === 'buy'){
              if (s.options.diff < 0 &&  s.period.rsi< 50){//down trend ngat lo
                s.trend = 'short'
                s.signal = 'sell'
                s.options.currentSignal = s.signal
                s.options.message = 'Case short sell o doan rsi duoi 50'
              } else if(s.options.diff > 0 && s.options.diff <3 &&  s.period.rsi > 62 &&  s.period.rsi < 75 ){ //uptrend len rsi 70 short sell ngat loi
                s.trend = 'short'
                s.signal = 'sell'
                s.options.currentSignal = s.signal
                s.options.message = 'Case short sell o doan rsi tren 62-75'
              } else if(s.options.diff >= s.options.diffKeepStop &&  s.period.rsi > 70 ){ //uptrend len rsi 70  vaf diff manh se keep buy vao
                s.trend = 'short'
                s.options.currentSignal = s.signal
                s.options.message = 'Case short keep coin ko sell'
              }
            }
          }
        }
        
        // rsi_low_track : Track rsi go to oversold if not change to a long trend.
        if(s.trend === 'short'){
        
          // Track rsi go to oversold if not change to a long trend.
            if ( s.period.rsi < 40 ){
               s.rsi_low_track = s.period.rsi
            }
            
            if(s.rsi_low_track !== undefined ){
              var diffRsi = s.period.rsi - s.rsi_low_track
              // uptrend again
              if(diffRsi > 10){
                 s.trend = 'long'
                 s.signal = 'buy'
                 s.rsi_high = s.period.rsi
                 s.rsi_low_track = undefined
              }
            }
        }

        if (s.trend !== 'oversold' && s.trend !== 'long' && s.period.rsi <= s.options.oversold_rsi) {
          s.rsi_low = s.period.rsi
          s.trend = 'oversold'
        }
        
        
        if (s.trend === 'long' && s.signal !== 'buy') {
        
           // case uptrend nhưng ko overbought xuống lại
            if(s.rsi_high >= 69  && s.period.rsi <= 45 && s.period.rsi >= 33){
               s.trend = 'short'
               s.signal = 'sell'
               s.options.currentSignal = s.signal
               s.options.message = 'Case overbought sell coin ngat lo down trend'
           }else if(s.rsi_high >= 45  && s.period.rsi <= 40 && s.period.rsi >= 33){
               s.trend = 'short'
               s.signal = 'sell'
               s.options.currentSignal = s.signal
               s.options.message = 'Case overbought sell coin ngat lo down trend'
           }
        }
        
        
        if (s.trend === 'oversold') {
          s.rsi_low = Math.min(s.rsi_low, s.period.rsi)
          if (s.period.rsi >= s.rsi_low + s.options.rsi_recover) {
            s.trend = 'long'
            s.signal = 'buy'
            s.rsi_high = s.period.rsi
            s.options.currentSignal = s.signal
            s.options.message = 'Case oversold buy coin'
            s.rsi_low_track = undefined
          }
        }
        if (s.trend === 'long') {
          s.rsi_high = Math.max(s.rsi_high, s.period.rsi)
         
          if (s.period.rsi <= s.rsi_high / s.options.rsi_divisor) {
            s.trend = 'short'
            s.signal = 'sell'
            s.options.currentSignal = s.signal
            s.options.message = 'Case long sell coin ngat lo'
          }
        }
        if ((s.trend ==='short' || s.trend === 'long' || s.trend === undefined) && s.signal !== 'sell' && s.period.rsi >= s.options.overbought_rsi) {
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
        
       var sTrend = ' '
    	 var sRsiHight = ' '	
	     var sRsiLow = ' '	
				
				
	     if (typeof s.rsi_high === 'number'){
	    	sRsiHight =  n(s.rsi_high).format('0')
	     }

	     if (typeof s.sRsiLow === 'number'){
		     sRsiLow = n(s.rsi_low).format('0')
	     }
	
	      if(s.trend !== undefined){
	        sTrend = s.trend
	      }


        cols.push(z(4, n(s.period.rsi).format('0') + ' ' + sTrend + ' h: ' + sRsiHight , ' ')[color])
      
      }
      return cols
    }
  }
}
