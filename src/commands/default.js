
'use strict'

const _ = require('lodash')
const config = require('../config')
const helper = require('../helper')
const trending = require('github-trending')
const cheerio = require('cheerio')
const html2md = require('html-md')
const csv = require('csv')
const async = require('async')
const sendMenus = require('../tasks/sendMenus')

const msgDefaults = {
  response_type: 'in_channel',
  username: 'Lunchy',
  icon_emoji: config('ICON_EMOJI')
}


const parseZomatoPage = function($, daysSelector){
  let rows = [];
  $(daysSelector).each((i, dayEl) => {
    if (_.includes($(dayEl).find('.tmi-group-name').text(), 'dnes')) {
      rows = $(dayEl).find('.tmi-daily.bold').map((i, itemEl) => {
        return $(itemEl).find('.tmi-text-group').text().trim() + ' *' + $(itemEl).find('.tmi-price').text().trim() + '*';
      }).get();

      return false; // break
    }
  });

  return rows.join('\n').trim();
}

const getMenuFromWeb = function(fetchURL, selector, callback) {
  let markdownText = '';
  let get_page = fetchURL.toLowerCase().startsWith('https') ? helper.get_page_secure : helper.get_page;

  get_page(fetchURL, function(data) {
    if (data) {
      let $ = cheerio.load(data);
      let $element = $(selector);

      if (!$element.length) return callback(null, 'No Menu yet. :knife_fork_plate:');

      if (_.includes(fetchURL.toLowerCase(), 'zomato.com')) {
        markdownText = parseZomatoPage($, selector);
      } else {
        markdownText = html2md($element.html());
        markdownText = _.filter(markdownText.replace(/\r/g, '').split('\n'), _.empty).join('\n');
      }

      callback(null, markdownText);
    } else {
      console.log("No Data for URL", fetchURL);
      callback('No Data for URL:' + fetchURL);
    }
  });
}


const getMenusFromCSV = function(callback) {
  const csvSchema = ['name', 'fetch_url', 'url', 'selector'];

  console.log('Loading list of Restaurants from CSV:', config('CSV_URL'));
  helper.get_page_secure(config('CSV_URL'), function(csvData) {
    if (!csvData) return callback('No CSV Data found on URL:' + config('CSV_URL'));

    csv.parse(csvData, (err, list) => {
      if (list) {
        list = list.slice(1).map((row) => {
          return row.reduce((remapedRow, col, i) => {
            remapedRow[csvSchema[i]] = col;
            return remapedRow;
          }, {});
        });
      }
      callback(err, list);
    });
  });
}

const handler = (payload, res) => {

  console.log('Payload:', payload);

  getMenusFromCSV((err, list) => {
    if (err) throw err

    let getMenuCallbacks = list.map((restaurant) => {
      return (callback) => {
        if (!restaurant.fetch_url || !restaurant.selector) return callback('Required Restaurant parameter missing.' + restaurant.name);

        console.log('Getting menu for: ' + restaurant.name);

        getMenuFromWeb(restaurant.fetch_url, restaurant.selector, (err, menuText) => {
          if (err) return callback(err);

          console.log('OK - Got menu for: ' + restaurant.name);

          callback(null, {
            title: restaurant.name,
            title_link: restaurant.url,
            text: menuText,
            //pretext: '',
            mrkdwn_in: ['text', 'pretext']
          });
        });
      };
    });

    console.log('Getting menus for [' + list.length + '] Restaurants');

    async.parallel(getMenuCallbacks, function(err, attachments){
      if (err) throw err

      console.log('Finished. Menus:', attachments);

      let msg = _.defaults({
        text: ':pacman: :pacman: :pacman:  :ghosty:',
        channel: payload && payload.channel_name,
        attachments: attachments
      }, msgDefaults);

      sendMenus(payload.response_url).sendWebhook(msg, (err, resp) => {
        if (err) throw err

        console.log('Menus were sent to Slack. RESP:', resp);
      })
    });
  });

  // Immediate Response
  if (payload) {
    let msg = _.defaults({
      channel: payload && payload.channel_name,
      attachments: {
        text: _.sample(['Right away, sir!', ':eye: :eye: sir!', 'It\'s coming...', 'And the winner is...', 'Wassuuup'])
      }
    }, msgDefaults);
    res.set('content-type', 'application/json')
    res.status(200).json(msg)
  }
}

module.exports = { pattern: /menus/ig, handler: handler }
