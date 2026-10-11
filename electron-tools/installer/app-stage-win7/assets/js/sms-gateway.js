/* Optix Medical Sync — phone SMS gateway bridge.
   Talks to the native SmsGateway Capacitor plugin, which exists only inside the
   lab's Android app (com.optix.labmedsync). On the plain web build every call
   reports unavailable and the gateway card stays hidden. */
(function () {
  'use strict';
  function plugin() {
    try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SmsGateway) || null; }
    catch (e) { return null; }
  }
  function noPlugin() { return Promise.reject(new Error('SMS gateway is only available inside the Optix lab app on your phone.')); }
  var api = {
    available: function () { return !!plugin(); },
    isNative: function () {
      try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
      catch (e) { return false; }
    },
    /* { enabled, lastPoll, lastSentAt, sentCount, permission } */
    status: function () { var p = plugin(); return p ? p.getStatus() : noPlugin(); },
    /* turn the phone's polling service on/off; passes the current API base + session token */
    setEnabled: function (on) {
      var p = plugin(); if (!p) return noPlugin();
      var base = '', token = '';
      try { base = window.LABPOS_API || ''; } catch (e) {}
      try { token = (window.DB && DB.sessToken) ? DB.sessToken() : ''; } catch (e) {}
      return p.setEnabled({ enabled: !!on, apiBase: base, token: token });
    },
    requestPermission: function () { var p = plugin(); return p ? p.requestPermission() : noPlugin(); },
    openAppSettings: function () { var p = plugin(); return p ? p.openAppSettings() : noPlugin(); }
  };
  window.App = window.App || {};
  App.smsGw = api;
})();
