import { Liquid } from '@chr33s/liquid'

export const engine = new Liquid()

engine.registerFilter('image', (src) => `<img src="${src}" class="logo" alt="">`)
