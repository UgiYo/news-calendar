// Verified publisher feeds: avoid relying on a rate-limited directory for these shows.
const shows={
 '6SjGs5mgZ4IAo82tHygxD2':{title:'小朋友學投資',author:'小朋友團隊',feed:'https://feed.firstory.me/rss/user/ckgt1mz641n230804jvx96k4m'},
 '1HOGxT9M7a6kpcDi4q27Q7':{title:'游庭皓的財經皓角',author:'游庭皓的財經皓角',feed:'https://feeds.soundcloud.com/users/soundcloud:users:735679489/sounds.rss'}
};
export function spotifyShowURL(value){
 const u=new URL(String(value||''));
 if(u.protocol!=='https:'||u.hostname!=='open.spotify.com'||u.username||u.password||u.port||!/^\/(?:intl-[a-z]+\/)?show\/[A-Za-z0-9]{22}\/?$/.test(u.pathname))throw Error('請貼上 Spotify 節目連結（show），不是單集連結。');
 return 'https://open.spotify.com/show/'+u.pathname.split('/').filter(Boolean).at(-1);
}
export function verifiedSpotifyFeed(value){try{return shows[spotifyShowURL(value).split('/').at(-1)]||null;}catch{return null;}}
