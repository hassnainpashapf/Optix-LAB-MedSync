/* Google AdSense settings for this PUBLIC website (home + download pages only; never the signed-in app, the console, sign-in/sign-up, reports or invoices).
   Leave `client` empty and nothing from Google is ever loaded: no script, no cookies, no consent banner, no empty ad boxes.
   To turn ads on:
     1. client: your AdSense publisher id, e.g. 'ca-pub-1234567890123456'
     2. slots:  the ad unit ids (10 digits) created in AdSense > Ads > By ad unit, one per page:  home / download
     3. run `node scripts/gen-ads-txt.mjs` (the build does this for you) so /ads.txt is written
   Then deploy the website. */
window.OPTIX_ADS = {
  client: '',
  slots: { home: '', download: '' }
};
