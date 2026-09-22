import { TagToken, Liquid, TopLevelToken, Tag } from '..'

export default class extends Tag {
  public readonly blank = true
  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(tagToken, remainTokens, liquid)
    if (tagToken.args.search(/\n\s*[^#\s]/g) !== -1) {
      throw new Error("Syntax error in tag '#' - Each line of comments must be prefixed by the '#' character")
    }
  }
  render() {}
}
