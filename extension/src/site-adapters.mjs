// Independently authored public DOM selectors. These do not import Immersive
// Translate's proprietary rules or execute website code.
const ADAPTERS=[
 {id:'social-posts',hosts:['x.com','twitter.com'],include:'[data-testid="tweetText"]',exclude:'[data-testid="tweetTextarea_0"],[role="textbox"]'},
 {id:'github-markdown',hosts:['github.com','gist.github.com'],include:'.markdown-body',exclude:'.monaco-editor,.react-code-view,.blob-code,.CodeMirror'},
 {id:'reddit-posts',hosts:['reddit.com'],include:'[slot="text-body"],.md,shreddit-comment [slot="comment"]',exclude:'[slot="composer"]'},
 {id:'chat-messages',hosts:['chatgpt.com','claude.ai','gemini.google.com'],include:'[data-message-author-role],.font-claude-response,model-response',exclude:'[contenteditable="true"],.cm-editor'},
 {id:'knowledge-articles',hosts:['wikipedia.org','stackoverflow.com','stackexchange.com'],include:'.mw-parser-output,.s-prose',exclude:'.mw-editsection,.s-code-block'},
 {id:'reader-content',hosts:['medium.com','substack.com','notion.site','notion.so'],include:'article,.body.markup,.notion-page-content',exclude:'.notion-code-block,[contenteditable="true"]'}
];
const match=(host,base)=>host===base || host.endsWith('.'+base);
export function siteAdapter(url) {
  let host;try{host=new URL(url).hostname;}catch{return {id:'generic',include:'',exclude:''};}
  return ADAPTERS.find(adapter=>adapter.hosts.some(base=>match(host,base))) || {id:'generic',include:'',exclude:''};
}
export function pageRule(config,url) {
  const adapter=siteAdapter(url);
  return {...config,adapter:adapter.id,
    // Site hints expand the generic coverage. A user's include selector remains
    // authoritative, so users can scope expensive or complex pages themselves.
    hints:config.include?'':adapter.include,
    exclude:[adapter.exclude,config.exclude,'.cm-editor,.monaco-editor,.CodeMirror,.katex,.MathJax,[role="code"],[data-ot-caption]'].filter(Boolean).join(',')};
}
