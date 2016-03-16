
'use strict'

const Botkit = require('botkit')

var controller = Botkit.slackbot({})
var bot = controller.spawn()

export default function sendMenus(url) {
  bot.configureIncomingWebhook({ url });
  return bot;
}