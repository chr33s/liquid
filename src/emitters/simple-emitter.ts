import { stringify, Limiter, Operation } from '../util'
import { Emitter } from './emitter'

export class SimpleEmitter implements Emitter {
  public buffer = ''
  private outputLengthLimit?: Limiter

  constructor(
    outputLengthLimit?: Limiter,
    private owner?: Operation
  ) {
    this.outputLengthLimit = outputLengthLimit
  }

  public write(html: any) {
    this.owner?.check()
    const str = stringify(html)
    this.outputLengthLimit?.use(str.length)
    this.buffer += str
  }
}
