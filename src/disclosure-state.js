// Read the live DOM before replacing it, including toggles whose event is still queued.
export function createDisclosureState(selector){
 let owner,open=false;
 return {
  get open(){return open;},
  capture(root,currentOwner){
   if(owner!==currentOwner){owner=currentOwner;open=false;return;}
   const disclosure=root.querySelector(selector);
   if(disclosure)open=disclosure.hasAttribute('open');
  }
 };
}
