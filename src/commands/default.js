
'use strict'

const _ = require('lodash')
const config = require('../config')
const helper = require('../helper')
const trending = require('github-trending')
const cheerio = require('cheerio')
const html2md = require('html-md')
const csv = require('csv')
const async = require('async')
import sendMenus from '../tasks/sendMenus'

const msgDefaults = {
  response_type: 'in_channel',
  username: 'Lunchy',
  icon_emoji: config('ICON_EMOJI')
}



const getZomatoMenu = function(zomatoURL, callback) {

  helper.get_page_secure(zomatoURL, function(data) {
    if (data) {
      var $ = cheerio.load(data);

      var markdownText = html2md($('#daily-menu-container').html());
      callback(null, markdownText);
    } else {
      console.log("No Zomato Data for URL", zomatoURL);
      callback('No Zomato Data for URL:' + zomatoURL);
    }
  });
}


const getMenusFromCSV = function(callback) {

  const csvSchema = ['name', 'zomato_url', 'url'];

  console.log('Loading list of Restaurants from CSV:', config('CSV_URL'));


  helper.get_page_secure(config('CSV_URL'), function(csvData) {
    if (csvData) {

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
    } else {
      callback('No CSV Data found on URL:' + config('CSV_URL'));
    }
  });
}

const handler = (payload, res) => {

  console.log('Payload:', payload);

  getMenusFromCSV((err, list) => {

    let getMenuCallbacks = list.map((restaurant) => {
      return (callback) => {
        if (!restaurant.zomato_url) return callback('Empty Zomato URL for Restaurant ' + restaurant.name);

        console.log('Getting menu for: ' + restaurant.name);

        getZomatoMenu(restaurant.zomato_url, (err, menuText) => {
          if (err) return callback(err);

          console.log('OK - Got menu for: ' + restaurant.name);

          callback(null, {
            title: restaurant.name,
            title_link: restaurant.url,
            text: menuText,
            mrkdwn_in: ['text', 'pretext']
          });
        });
      };
    });

    console.log('Getting menus for [' + list.length + '] Restaurants');


    let msg = _.defaults({
      channel: payload.channel_name,
      attachments: {
        text: 'Just a second... Getting Menus for ' + list.length + ' Restaurants...'
      }
    }, msgDefaults);
    res.set('content-type', 'application/json')
    res.status(200).json(msg)



    async.parallel(getMenuCallbacks, function(err, attachments){
      if (err) throw err

      console.log('Finished. Menus:', attachments);

      let msg = _.defaults({
        channel: payload.channel_name,
        attachments: attachments
      }, msgDefaults);

      sendMenus(payload.response_url).sendWebhook(msg, (err, res) => {
        if (err) throw err

        console.log('Menus were sent to Slack. RES:', res);
      })
    });
  });
}

module.exports = { pattern: /menus/ig, handler: handler }
