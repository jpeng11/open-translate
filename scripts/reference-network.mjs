// Pin packaged reference configuration: external DNS names must not fetch live
// vendor config or telemetry. This is a browser test environment, not a firewall
// against literal-IP traffic or a change to the shipped extension source.
export const REFERENCE_NETWORK_ARGS=['--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'];
export const REFERENCE_NETWORK_POLICY={externalHostnameResolution:'blocked',allowedHosts:['localhost','127.0.0.1'],proxy:'disabled',literalIpTraffic:'not firewalled'};
