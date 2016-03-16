
'use strict'

const Botkit = require('botkit')

var controller = Botkit.slackbot({})
var bot = controller.spawn()

module.exports = function sendMenus(url) {
  bot.configureIncomingWebhook({ url });
  return bot;
}