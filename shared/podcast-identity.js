export function canonicalPodcastFeed(value){
 try{const u=new URL(value);u.hash='';if(u.hostname==='feeds.soundcloud.com'){const match=decodeURIComponent(u.pathname).match(/^\/users\/soundcloud:users:(\d+)\/sounds\.rss\/?$/);if(match)u.pathname='/users/soundcloud:users:'+match[1]+'/sounds.rss';}return u.href;}catch{return String(value||'');}
}
const titleKey=c=>String(c.title||'').normalize('NFKC').trim().toLowerCase();
export function podcastEpisodeKeys(c){return c.episode_keys||[...new Set((c.episodes||[]).map(e=>String(e.id||'').replace(c.id+'::','')||e.audio_url).filter(Boolean))].slice(0,30);}
export function samePodcastChannel(a,b){
 const af=canonicalPodcastFeed(a.feed||a.refreshFeed),bf=canonicalPodcastFeed(b.feed||b.refreshFeed);
 if(af&&af===bf)return true;
 if(!titleKey(a)||titleKey(a)!==titleKey(b))return false;
 const keys=new Set(podcastEpisodeKeys(a));return podcastEpisodeKeys(b).filter(k=>keys.has(k)).length>=2;
}
export function dedupePodcastChannels(channels){
 const result=[];for(const channel of channels){const existing=result.find(c=>samePodcastChannel(c,channel));if(!existing){result.push({...channel,aliases:[...new Set(channel.aliases||[])]});continue;}
 existing.aliases=[...new Set([...existing.aliases,channel.id,...(channel.aliases||[])])].filter(id=>id!==existing.id);
 existing.episode_keys=[...new Set([...podcastEpisodeKeys(existing),...podcastEpisodeKeys(channel)])].slice(0,60);
 }return result;
}
