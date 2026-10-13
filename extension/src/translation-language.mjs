const NAMES={en:'English',zh:'Chinese','zh-cn':'Simplified Chinese','zh-tw':'Traditional Chinese',ja:'Japanese',ko:'Korean',fr:'French',es:'Spanish',de:'German',pt:'Portuguese',it:'Italian',ru:'Russian',ar:'Arabic',hi:'Hindi',vi:'Vietnamese',th:'Thai',tr:'Turkish',nl:'Dutch',pl:'Polish',uk:'Ukrainian',id:'Indonesian',fa:'Persian',he:'Hebrew',sv:'Swedish'};
export function targetDescription(code){const key=code.toLowerCase();return `${NAMES[key] || NAMES[key.split('-')[0]] || code} (${code})`;}
// This is a narrow guard for long English prose, not general language ID.
// Names, short selections and unknown source languages are left alone.
export function wrongTargetScript(source,translated,sourceLanguage,targetLanguage){
 if(!/^en(?:-|$)/i.test(sourceLanguage))return false;
 const prose=text=>text.replace(/<[^>]+>|\{\{?\d+\}\}?|⟦OT[A-Za-z0-9_]+⟧/g,'');
 if((prose(source).match(/[A-Za-z]+/g) || []).length<12)return false;
 const text=prose(translated),target=targetLanguage.toLowerCase().split('-')[0];
 if(target==='ja')return !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
 if(target==='ko')return !/\p{Script=Hangul}/u.test(text);
 if(target==='zh')return !/\p{Script=Han}/u.test(text);
 return false;
}
