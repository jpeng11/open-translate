// Generate browser-specific manifests without changing the Chromium source.
export function browserManifest(source,browser) {
  const manifest=structuredClone(source);
  if(browser==='chrome' || browser==='edge'){manifest.minimum_chrome_version='116';return manifest;}
  if(!['firefox','safari'].includes(browser))throw new Error('Unknown browser target: '+browser);
  delete manifest.minimum_chrome_version;
  manifest.permissions=manifest.permissions.filter(permission=>permission!=='offscreen');
  manifest.background={scripts:['background.js'],persistent:false};
  if(browser==='firefox')manifest.browser_specific_settings={
    gecko:{id:'open-translate@open-translate.local',strict_min_version:'140.0',data_collection_permissions:{required:['websiteContent'],optional:[]}},
    gecko_android:{strict_min_version:'142.0'}
  };
  if(browser==='safari'){delete manifest.background.persistent;delete manifest.options_ui.open_in_tab;for(const content of manifest.content_scripts)delete content.match_about_blank;}
  // Safari grants site access through its native extension controls. Apple
  // packaging creates the macOS/iOS host applications from this directory.
  return manifest;
}
