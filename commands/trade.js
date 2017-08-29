var tb = require('timebucket')
  , minimist = require('minimist')
  , n = require('numbro')
  , fs = require('fs')
  , path = require('path')
  , spawn = require('child_process').spawn
  , moment = require('moment')
  , crypto = require('crypto')
  , readline = require('readline')

module.exports = function container (get, set, clear) {
  var c = get('conf')
  return function (program) {
    program
      .command('trade [selector]')
      .allowUnknownOption()
      .description('run trading bot against live market data')
      .option('--conf <path>', 'path to optional conf overrides file')
      .option('--strategy <name>', 'strategy to use', String, c.strategy)
      .option('--order_type <type>', 'order type to use (maker/taker)', /^(maker|taker)$/i, c.order_type)
      .option('--paper', 'use paper trading mode (no real trades will take place)', Boolean, false)
      .option('--manual', 'watch price and account balance, but do not perform trades automatically', Boolean, false)
      .option('--non_interactive', 'disable keyboard inputs to the bot', Boolean, false)
      .option('--currency_capital <amount>', 'for paper trading, amount of start capital in currency', Number, c.currency_capital)
      .option('--asset_capital <amount>', 'for paper trading, amount of start capital in asset', Number, c.asset_capital)
      .option('--avg_slippage_pct <pct>', 'avg. amount of slippage to apply to paper trades', Number, c.avg_slippage_pct)
      .option('--buy_pct <pct>', 'buy with this % of currency balance', Number, c.buy_pct)
      .option('--sell_pct <pct>', 'sell with this % of asset balance', Number, c.sell_pct)
      .option('--markup_pct <pct>', '% to mark up or down ask/bid price', Number, c.markup_pct)
      .option('--order_adjust_time <ms>', 'adjust bid/ask on this interval to keep orders competitive', Number, c.order_adjust_time)
      .option('--order_poll_time <ms>', 'poll order status on this interval', Number, c.order_poll_time)
      .option('--sell_stop_pct <pct>', 'sell if price drops below this % of bought price', Number, c.sell_stop_pct)
      .option('--buy_stop_pct <pct>', 'buy if price surges above this % of sold price', Number, c.buy_stop_pct)
      .option('--profit_stop_enable_pct <pct>', 'enable trailing sell stop when reaching this % profit', Number, c.profit_stop_enable_pct)
      .option('--profit_stop_pct <pct>', 'maintain a trailing stop this % below the high-water mark of profit', Number, c.profit_stop_pct)
      .option('--max_sell_loss_pct <pct>', 'avoid selling at a loss pct under this float', c.max_sell_loss_pct)
      .option('--max_slippage_pct <pct>', 'avoid selling at a slippage pct above this float', c.max_slippage_pct)
      .option('--rsi_periods <periods>', 'number of periods to calculate RSI at', Number, c.rsi_periods)
      .option('--poll_trades <ms>', 'poll new trades at this interval in ms', Number, c.poll_trades)
      .option('--disable_stats', 'disable printing order stats')
      .option('--reset_profit', 'start new profit calculation from 0')
      .option('--debug', 'output detailed debug info')
      .action(function (selector, cmd) {
        var raw_opts = minimist(process.argv)
        var s = {options: JSON.parse(JSON.stringify(raw_opts))}
        var so = s.options
        delete so._
        Object.keys(c).forEach(function (k) {
          if (typeof cmd[k] !== 'undefined') {
            so[k] = cmd[k]
          }
        })
        so.debug = cmd.debug
        so.stats = !cmd.disable_stats
        so.mode = so.paper ? 'paper' : 'live'
        if (cmd.conf) {
          var overrides = require(path.resolve(process.cwd(), cmd.conf))
          Object.keys(overrides).forEach(function (k) {
            so[k] = overrides[k]
          })
        }
        so.selector = get('lib.normalize-selector')(so.selector || selector || c.selector)
        var exchange_id = so.selector.split('.')[0]
        var product_id = so.selector.split('.')[1]
        var exchange = get('exchanges.' + exchange_id)
        if (!exchange) {
          console.error('cannot trade ' + so.selector + ': exchange not implemented')
          process.exit(1)
        }
        var engine = get('lib.engine')(s)

        var order_types = ['maker', 'taker']
        if (!so.order_type in order_types || !so.order_type) {
          so.order_type = 'maker'
        }
		    so.keep = false
		    so.NeedRSI = false
        so.lowestPrice = 0
        so.willBuyAt = 0
        so.willSellAt = 0
        so.lastBuy = 0
        so.lastSell = 0
        so.diff = 0 
        so.currentTrend = ''
        so.diffBuyStop = 1.7
        so.diffKeepStop = 3.5
        so.signal = ''
        so.signalOn = false
        so.currentSignal = ''
        var db_cursor, trade_cursor
        var query_start = tb().resize(so.period).subtract(so.min_periods * 2).toMilliseconds()
        var days = Math.ceil((new Date().getTime() - query_start) / 86400000)
        var trades_per_min = 0
        var session = null
        var sessions = get('db.sessions')
        var balances = get('db.balances')
        var trades = get('db.trades')
        get('db.mongo').collection('trades').ensureIndex({selector: 1, time: 1})
        var resume_markers = get('db.resume_markers')
        get('db.mongo').collection('resume_markers').ensureIndex({selector: 1, to: -1})
        var marker = {
          id: crypto.randomBytes(4).toString('hex'),
          selector: so.selector,
          from: null,
          to: null,
          oldest_time: null
        }
        var lookback_size = 0
        var my_trades_size = 0
        var my_trades = get('db.my_trades')
        var periods = get('db.periods')

        console.log('fetching pre-roll data:')
        var zenbot_cmd = process.platform === 'win32' ? 'zenbot.bat' : 'zenbot.sh'; // Use 'win32' for 64 bit windows too
        var backfiller = spawn(path.resolve(__dirname, '..', zenbot_cmd), ['backfill', so.selector, '--days', days])
        backfiller.stdout.pipe(process.stdout)
        backfiller.stderr.pipe(process.stderr)
        backfiller.on('exit', function (code) {
          if (code) {
            process.exit(code)
          }
          function getNext () {
            var opts = {
              query: {
                selector: so.selector
              },
              sort: {time: 1},
              limit: 1000
            }
            if (db_cursor) {
              opts.query.time = {$gt: db_cursor}
            }
            else {
              trade_cursor = s.exchange.getCursor(query_start) 
              opts.query.time = {$gte: query_start}
            }
            get('db.trades').select(opts, function (err, trades) {
              if (err) throw err
              if (!trades.length) {
                console.log('---------------------------- STARTING ' + so.mode.toUpperCase() + ' TRADING ----------------------------')
                if (so.mode === 'paper') {
                  console.log('!!! Paper mode enabled. No real trades are performed until you remove --paper from the startup command.')
                }
                engine.syncBalance(function (err) {
                  if (err) {
                    if (err.desc) console.error(err.desc)
                    if (err.body) console.error(err.body)
                    throw err
                  }
                  session = {
                    id: crypto.randomBytes(4).toString('hex'),
                    selector: so.selector,
                    started: new Date().getTime(),
                    mode: so.mode,
                    options: so
                  }
                  sessions.select({query: {selector: so.selector}, limit: 1, sort: {started: -1}}, function (err, prev_sessions) {
                    if (err) throw err
                    var prev_session = prev_sessions[0]
                    if (prev_session && !cmd.reset_profit) {
                      if (prev_session.orig_capital && prev_session.orig_price && ((so.mode === 'paper' && !raw_opts.currency_capital && !raw_opts.asset_capital) || (so.mode === 'live' && prev_session.balance.asset == s.balance.asset && prev_session.balance.currency == s.balance.currency))) {
                        s.orig_capital = session.orig_capital = prev_session.orig_capital
                        s.orig_price = session.orig_price = prev_session.orig_price
                        if (so.mode === 'paper') {
                          s.balance = prev_session.balance
                        }
                      }
                    }
                    lookback_size = s.lookback.length
                    forwardScan()
                    setInterval(forwardScan, c.poll_trades)
                    readline.emitKeypressEvents(process.stdin)
                    if (!so.non_interactive && process.stdin.setRawMode) {
                      process.stdin.setRawMode(true)
                      process.stdin.on('keypress', function (key, info) {
                        if (key === 'b' && !info.ctrl ) {
                          engine.executeSignal('buy')
                        }
                        else if (key === 'B' && !info.ctrl) {
                          engine.executeSignal('buy', null, null, false, true)
                        }
                        else if (key === 's' && !info.ctrl) {
                          engine.executeSignal('sell')
                        }
                        else if (key === 'S' && !info.ctrl) {
                          engine.executeSignal('sell', null, null, false, true)
                        }
                        else if ((key === 'c' || key === 'C') && !info.ctrl) {
                          delete s.buy_order
                          delete s.sell_order
                        }
                        else if ((key === 'm' || key === 'M') && !info.ctrl) {
                          so.manual = !so.manual
                          console.log('\nmanual mode: ' + (so.manual ? 'ON' : 'OFF') + '\n')
                        }
                        else if ((key === 'k' || key === 'K') && !info.ctrl) {
                          so.keep = !so.keep
                          console.log('\nKeep mode: ' + (so.keep ? 'ON' : 'OFF'))
                        }
                        else if ((key === 'k' || key === 'K') && !info.ctrl) {
                          so.keep = !so.keep
                          console.log('\nKeep mode test: ' + (so.keep ? 'ON' : 'OFF') + '\n')
                        } else if ((key === 'n' || key === 'N') && !info.ctrl) {
                          so.NeedRSI = !so.NeedRSI
                          console.log('\nNeedRSI mode test: ' + (so.NeedRSI ? 'ON' : 'OFF') + '\n')
                        }
                        else if((key === 'o' || key === 'O') && !info.ctrl) {
                          console.log('\n1.so.buy_pct: ' +  so.buy_pct)
                          console.log('2.so.sell_pct: ' +  so.sell_pct)
                          console.log('3.so.profit_stop_enable_pct: ' +  so.profit_stop_enable_pct)
                          console.log('4.so.profit_stop_pct: ' +  so.profit_stop_pct)
                          console.log('5.so.buy_stop_pct: ' +  so.buy_stop_pct)
                          console.log('6.so.sell_stop_pct: ' +  so.sell_stop_pct)
                          console.log('7.so.rsi_divisor: ' +  so.rsi_divisor)
                          console.log('8.so.rsi_recover: ' +  so.rsi_recover)
                          console.log('9.so.trend: ' +  so.trend)
                          console.log('0.so.rsi_low: ' +  so.rsi_low)
                          console.log('`.so.rsi_high: ' +  so.rsi_high)
                          console.log('w.so.diffBuyStop: '+ so.diffBuyStop)
                          console.log('e.so.diffBuyStop: '+ so.diffKeepStop)
                          console.log('r.so.signal: '+ so.signal)
                          console.log('-----------------------')
                          console.log('Last buy at: ' +  so.lastBuy)
                          console.log('Will sell at: ' +  so.willSellAt)
                          console.log('LastSell at: ' +  so.lastSell)
                          console.log('Will buy at: ' +  so.willBuyAt)
                          console.log('Diff: ' + so.diff)
                          console.log('Current trend: ' +so.currentTrend)
                          console.log('Executed trend: ' +  so.currentSignal)
                        }

                        else if ((key === '1' || key === '1') && !info.ctrl) {
                          so.menu = 1
                        }
                        else if ((key === '2' || key === '2') && !info.ctrl) {
                          so.menu = 2
                        }
                        else if ((key === '3' || key === '3') && !info.ctrl) {
                          so.menu = 3
                        }
                        else if ((key === '4' || key === '4') && !info.ctrl) {
                          so.menu = 4
                        }
                        else if ((key === '5' || key === '5') && !info.ctrl) {
                          so.menu = 5
                        }
                        else if ((key === '6' || key === '6') && !info.ctrl) {
                          so.menu = 6
                        }
                        else if ((key === '7' || key === '7') && !info.ctrl) {
                          so.menu = 7
                        }
                        else if ((key === '8' || key === '8') && !info.ctrl) {
                          so.menu = 8
                        }
                        else if ((key === '9' || key === '9') && !info.ctrl) {
                          so.menu = 9
                        }
                        else if ((key === '0' || key === '0') && !info.ctrl) {
                          so.menu = 0
                        }
                        else if ((key === '`' || key === '`') && !info.ctrl) {
                          so.menu = '`'
                        }
                        else if ((key === 'w' || key === 'W') && !info.ctrl) {
                          so.menu = 'w'
                        }
                        else if ((key === 'e' || key === 'E') && !info.ctrl) {
                          so.menu = 'e'
                        }
                        else if ((key === 'r' || key === 'R') && !info.ctrl) {
                          so.signalOn= !so.signalOn
                          if(so.signalOn == true){
                            so.signal = 'buy'
                          } else so.signal = 'sell'
                          console.log('\nSignal: ' + (so.signal) + '\n')
                        }
                        else if ((key === '=' || key === '=') && !info.ctrl) {
                          if(so.menu == 1){
                              if(so.buy_pct === undefined) so.buy_pct = 0
                              so.buy_pct += 0.1
                          } else if(so.menu == 2){
                              if(so.buy_pct === undefined) so.sell_pct = 0
                              so.sell_pct += 0.1
                          }else if(so.menu == 3){
                            so.profit_stop_enable_pct += 0.1
                          }else if(so.menu == 4){
                            if(so.profit_stop_pct === undefined) so.profit_stop_pct = 0
                            so.profit_stop_pct += 0.1
                          }else if(so.menu == 5){
                            if(so.buy_stop_pct === undefined) so.buy_stop_pct = 0
                            so.buy_stop_pct += 0.1
                          }else if(so.menu == 6){
                            if(so.sell_stop_pct === undefined) so.sell_stop_pct = 0
                            so.sell_stop_pct += 0.1
                          }else if(so.menu == 7){
                            if(so.rsi_divisor === undefined) so.rsi_divisor = 2
                            so.rsi_divisor += 0.1
                          }else if(so.menu == 8){
                            if(so.rsi_recover === undefined) so.rsi_recover = 3
                            so.rsi_recover += 1
                          }
                          else if(so.menu == 9){
                            if(so.trendNo === undefined) so.trendNo = 0
                            so.trendNo +=1
                              if(so.trendNo == 1){
                                so.trend = 'oversold'
                                so.rsi_low = 29
                              } else if(so.trendNo == 2){
                                so.trend = 'overbought'
                                so.rsi_high = 85
                                so.rsi_low = 29
                              }else if(so.trendNo == 3){
                                so.trend = 'long'
                                so.rsi_high = 40
                                so.rsi_low = 29
                              }else if(so.trendNo == 4){
                                so.trend = 'short'
                                so.rsi_high = 85
                                so.rsi_low = 29
                              } else if (so.trendNo > 4) {
                                so.trendNo = 0
                                so.rsi_low = 25
                              }
                          }else if(so.menu == 0){
                            if(so.rsi_low == undefined) so.rsi_low = 30
                            so.rsi_low += 1
                          }else if(so.menu == '`') {
                            if (so.rsi_high == undefined) so.rsi_high = 50
                            so.rsi_high += 1
                          }
                          else if(so.menu == 'w') {
                            if (so.diffBuyStop == undefined) so.diffBuyStop = 1.7
                            so.diffBuyStop += 0.1
                          }
                          else if(so.menu == 'e') {
                            if (so.diffKeepStop == undefined) so.diffKeepStop = 3.5
                            so.rsi_high += 0.1
                          }
                        }
                        else if ((key === '-' || key === '-') && !info.ctrl) {
                          if(so.menu == 1){
                            if(so.buy_pct === undefined) so.buy_pct = 0
                            so.buy_pct -= 0.1
                          } else if(so.menu == 2){
                            if(so.buy_pct === undefined) so.sell_pct = 0
                            so.sell_pct -= 0.1
                          }else if(so.menu == 3){
                            so.profit_stop_enable_pct -= 0.1
                          }else if(so.menu == 4){
                            if(so.profit_stop_pct === undefined) so.profit_stop_pct = 0
                            so.profit_stop_pct -= 0.1
                          }else if(so.menu == 5){
                            if(so.buy_stop_pct === undefined) so.buy_stop_pct = 0
                            so.buy_stop_pct -= 0.1
                          }else if(so.menu == 6){
                            if(so.sell_stop_pct === undefined) so.sell_stop_pct = 0
                            so.sell_stop_pct -= 0.1
                          }else if(so.menu == 7){
                            if(so.rsi_divisor === undefined) so.rsi_divisor = 2
                            so.rsi_divisor -= 0.1
                          }else if(so.menu == 8){
                            if(so.rsi_recover === undefined) so.rsi_recover = 3
                            so.rsi_recover -= 1
                          }
                          else if(so.menu == 9){
                            if(so.trendNo === undefined) so.trendNo = 0
                            so.trendNo -=1
                            if(so.trendNo == 1){
                              so.trend = 'oversold'
                            } else if(so.trendNo == 2){
                              so.trend = 'overbought'
                            }else if(so.trendNo == 3){
                              so.trend = 'long'
                            }else if(so.trendNo == 4){
                              so.trend = 'short'
                            } else if(so.trendNo > 4){
                              so.trendNo = 0
                            }

                          }else if(so.menu == 0){
                            if(so.rsi_low === undefined) so.rsi_low = 30
                            so.rsi_low -= 1
                          }else if(so.menu == '`') {
                            if (so.rsi_high === undefined) so.rsi_high = 50
                            so.rsi_high -= 1
                          }else if(so.menu == 'w') {
                            if (so.diffBuyStop == undefined) so.diffBuyStop = 1.7
                            so.diffBuyStop -= 0.1
                          }
                          else if(so.menu == 'e') {
                            if (so.diffKeepStop == undefined) so.diffKeepStop = 3.5
                            so.rsi_high -= 0.1
                          }
                        }
                        else if (info.name === 'c' && info.ctrl) {
                          // @todo: cancel open orders before exit
                          console.log()
                          process.exit()
                        }
                      })
                    }
                  })
                })
                return
              }
              engine.update(trades, true, function (err) {
                if (err) throw err
                db_cursor = trades[trades.length - 1].time
                trade_cursor = exchange.getCursor(trades[trades.length - 1])
                setImmediate(getNext)
              })
            })
          }
          engine.writeHeader()
          getNext()
        })

        var prev_timeout = null
        function forwardScan () {
          function saveSession () {
            engine.syncBalance(function (err) {
              if (err) {
                console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - error syncing balance')
                if (err.desc) console.error(err.desc)
                if (err.body) console.error(err.body)
                console.error(err)
              }
              session.updated = new Date().getTime()
              session.balance = s.balance
              session.start_capital = s.start_capital
              session.start_price = s.start_price
              session.num_trades = s.my_trades.length
              if (!session.orig_capital) session.orig_capital = s.start_capital
              if (!session.orig_price) session.orig_price = s.start_price
              if (s.period) {
                session.price = s.period.close
                var d = tb().resize(c.balance_snapshot_period)
                var b = {
                  id: so.selector + '-' + d.toString(),
                  selector: so.selector,
                  time: d.toMilliseconds(),
                  currency: s.balance.currency,
                  asset: s.balance.asset,
                  price: s.period.close,
                  start_capital: session.orig_capital,
                  start_price: session.orig_price,
                }
                b.consolidated = n(s.balance.asset).multiply(s.period.close).add(s.balance.currency).value()
                b.profit = (b.consolidated - session.orig_capital) / session.orig_capital
                b.buy_hold = s.period.close * (session.orig_capital / session.orig_price)
                b.buy_hold_profit = (b.buy_hold - session.orig_capital) / session.orig_capital
                b.vs_buy_hold = (b.consolidated - b.buy_hold) / b.buy_hold
                if (so.mode === 'live') {
                  balances.save(b, function (err) {
                    if (err) {
                      console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - error saving balance')
                      console.error(err)
                    }
                  })
                }
                session.balance = b
              }
              else {
                session.balance = {
                  currency: s.balance.currency,
                  asset: s.balance.asset
                }
              }
              sessions.save(session, function (err) {
                if (err) {
                  console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - error saving session')
                  console.error(err)
                }
                if (s.period) {
                  engine.writeReport(true)
                } else {
                  readline.clearLine(process.stdout)
                  readline.cursorTo(process.stdout, 0)
                  process.stdout.write('Waiting on first live trade to display reports, could be a few minutes ...')
                }
              })
            })
          }
          var opts = {product_id: product_id, from: trade_cursor}
          exchange.getTrades(opts, function (err, trades) {
            if (err) {
              if (err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET') {
                if (prev_timeout) {
                  console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - getTrades request timed out. retrying...')
                }
                prev_timeout = true
              }
              else if (err.code === 'HTTP_STATUS') {
                if (prev_timeout) {
                  console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - getTrades request failed: ' + err.message + '. retrying...')
                }
                prev_timeout = true
              }
              else {
                console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - getTrades request failed. retrying...')
                console.error(err)
              }
              return
            }
            prev_timeout = null
            if (trades.length) {
              trades.sort(function (a, b) {
                if (a.time > b.time) return -1
                if (a.time < b.time) return 1
                return 0
              })
              trades.forEach(function (trade) {
                var this_cursor = exchange.getCursor(trade)
                trade_cursor = Math.max(this_cursor, trade_cursor)
                saveTrade(trade)
              })
              engine.update(trades, function (err) {
                if (err) {
                  console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - error saving session')
                  console.error(err)
                }
                resume_markers.save(marker, function (err) {
                  if (err) {
                    console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - error saving marker')
                    console.error(err)
                  }
                })
                if (s.my_trades.length > my_trades_size) {
                  s.my_trades.slice(my_trades_size).forEach(function (my_trade) {
                    my_trade.id = crypto.randomBytes(4).toString('hex')
                    my_trade.selector = so.selector
                    my_trade.session_id = session.id
                    my_trade.mode = so.mode
                    my_trades.save(my_trade, function (err) {
                      if (err) {
                        console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - error saving my_trade')
                        console.error(err)
                      }
                    })
                  })
                  my_trades_size = s.my_trades.length
                }
                function savePeriod (period) {
                  if (!period.id) {
                    period.id = crypto.randomBytes(4).toString('hex')
                    period.selector = so.selector
                    period.session_id = session.id
                  }
                  periods.save(period, function (err) {
                    if (err) {
                      console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - error saving my_trade')
                      console.error(err)
                    }
                  })
                }
                if (s.lookback.length > lookback_size) {
                  savePeriod(s.lookback[0])
                  lookback_size = s.lookback.length
                }
                if (s.period) {
                  savePeriod(s.period)
                }
                saveSession()
              })
            }
            else {
              saveSession()
            }
          })
          function saveTrade (trade) {
            trade.id = so.selector + '-' + String(trade.trade_id)
            trade.selector = so.selector
            if (!marker.from) {
              marker.from = trade_cursor
              marker.oldest_time = trade.time
              marker.newest_time = trade.time
            }
            marker.to = marker.to ? Math.max(marker.to, trade_cursor) : trade_cursor
            marker.newest_time = Math.max(marker.newest_time, trade.time)
            trades.save(trade, function (err) {
              // ignore duplicate key errors
              if (err && err.code !== 11000) {
                console.error('\n' + moment().format('YYYY-MM-DD HH:mm:ss') + ' - error saving trade')
                console.error(err)
              }
            })
          }
        }
      })
  }
}
