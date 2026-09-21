import { Liquid } from '@chr33s/liquid';

export const engine = new Liquid({
    root: 'views/',
    extname: '.liquid'     // the extname used for layouts/includes, defaults 
});

engine.registerFilter('image', d => {
  let img = `<img src="${d}" class="App-logo" alt="logo"></img>`;  
  return img 
})
