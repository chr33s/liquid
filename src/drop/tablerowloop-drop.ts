import { ForloopDrop } from './forloop-drop'
import { hideMembers } from './drop'

const HIDDEN = hideMembers('i', 'next', 'cols', 'column', 'line')

/** The reference counts columns up to `cols` and then starts a new row; with no positive `cols` a row never ends. */
export class TablerowloopDrop extends ForloopDrop {
  private cols: number
  private column = 1
  private line = 1
  public constructor(length: number, cols: number, collection: string, variable: string) {
    super(length, collection, variable)
    this.length = length
    this.cols = cols
  }
  public hiddenMembers() {
    return HIDDEN
  }
  public next() {
    super.next()
    if (this.column === this.cols) {
      this.column = 1
      this.line++
    } else this.column++
  }
  public row() {
    return this.line
  }
  public col0() {
    return this.column - 1
  }
  public col() {
    return this.column
  }
  public col_first() {
    return this.column === 1
  }
  public col_last() {
    return this.column === this.cols
  }
}
