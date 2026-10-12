export function searchMarket(query,current='TW'){
 const value=String(query||'').normalize('NFKC').trim();
 if(/^(?:US|NASDAQ|NYSE)\s*:/i.test(value))return 'US';
 if(/^TW\s*:/i.test(value))return 'TW';
 // Numeric Taiwan codes retain the chosen market. English symbols/names in
 // Taiwan mode are routed to US rather than silently returning no matches.
 return current==='TW'&&/^[A-Za-z][A-Za-z0-9 .&-]*$/.test(value)?'US':current;
}
export function normalizeSearchQuery(query){return String(query||'').normalize('NFKC').trim().replace(/^(?:US|TW|NASDAQ|NYSE)\s*:\s*/i,'').trim();}
