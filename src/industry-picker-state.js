export function createIndustryPickerState(){
 let owner,open=false,query='',scroll=0,focus='',selectionStart=null,selectionEnd=null;
 return {
  capture(root,currentOwner){
   if(currentOwner!==undefined&&owner!==currentOwner){owner=currentOwner;open=false;query='';scroll=0;focus='';selectionStart=selectionEnd=null;return;}
   const picker=root?.querySelector('.flow-picker');if(!picker)return;
   open=picker.hasAttribute('open');const input=picker.querySelector('[data-flow-search]');query=input?.value||'';scroll=picker.querySelector('.flow-picker-options')?.scrollTop||0;
   const active=root.ownerDocument?.activeElement;focus=active===input?'search':active===picker.querySelector('summary')?'summary':'';selectionStart=input?.selectionStart;selectionEnd=input?.selectionEnd;
  },
  close(){open=false;focus='';},
  restore(root){
   const picker=root?.querySelector('.flow-picker');if(!picker)return;
   if(open)picker.setAttribute('open','');else picker.removeAttribute('open');
   const input=picker.querySelector('[data-flow-search]');if(input){input.value=query;input.oninput?.({target:input});}
   const options=picker.querySelector('.flow-picker-options');if(options)options.scrollTop=scroll;
   if(open&&focus==='search'){input?.focus({preventScroll:true});if(selectionStart!=null&&typeof input?.setSelectionRange==='function')input.setSelectionRange(selectionStart,selectionEnd);}
   else if(focus==='summary')picker.querySelector('summary')?.focus({preventScroll:true});
  }
 };
}
export const industryPickerState=createIndustryPickerState();
