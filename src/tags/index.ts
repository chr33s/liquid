import AssignTag from './assign'
import ForTag from './for'
import CaptureTag from './capture'
import CaseTag from './case'
import CommentTag from './comment'
import IncludeTag from './include'
import RenderTag from './render'
import DecrementTag from './decrement'
import CycleTag from './cycle'
import IfTag from './if'
import IncrementTag from './increment'
import LayoutTag from './layout'
import RawTag from './raw'
import TablerowTag from './tablerow'
import UnlessTag from './unless'
import BreakTag from './break'
import ContinueTag from './continue'
import EchoTag from './echo'
import LiquidTag from './liquid'
import InlineCommentTag from './inline-comment'
import DocTag from './doc'
import IfchangedTag from './ifchanged'
import PaginateTag from './paginate'
import SchemaTag from './schema'
import SectionTag from './section'
import SectionsTag from './sections'
import ContentForTag from './content-for'
import StyleTag from './style'
import { StylesheetTag, JavascriptTag } from './asset'
import FormTag from './form'
import type { TagClass } from '../template/tag'

/** The reference engine's tags. */
export const tags: Record<string, TagClass> = {
  assign: AssignTag,
  for: ForTag,
  capture: CaptureTag,
  case: CaseTag,
  comment: CommentTag,
  include: IncludeTag,
  render: RenderTag,
  decrement: DecrementTag,
  increment: IncrementTag,
  cycle: CycleTag,
  if: IfTag,
  raw: RawTag,
  tablerow: TablerowTag,
  unless: UnlessTag,
  break: BreakTag,
  continue: ContinueTag,
  echo: EchoTag,
  liquid: LiquidTag,
  doc: DocTag,
  ifchanged: IfchangedTag,
  '#': InlineCommentTag
}

/** Tags the hosted theme dialect adds, registered by the `shopify_theme` profile only. */
export const hostedTags: Record<string, TagClass> = {
  layout: LayoutTag,
  paginate: PaginateTag,
  schema: SchemaTag,
  section: SectionTag,
  sections: SectionsTag,
  content_for: ContentForTag,
  style: StyleTag,
  form: FormTag,
  stylesheet: StylesheetTag,
  javascript: JavascriptTag
}

export {
  AssignTag,
  ForTag,
  CaptureTag,
  CaseTag,
  CommentTag,
  IncludeTag,
  RenderTag,
  DecrementTag,
  IncrementTag,
  CycleTag,
  IfTag,
  LayoutTag,
  RawTag,
  TablerowTag,
  UnlessTag,
  BreakTag,
  ContinueTag,
  EchoTag,
  LiquidTag,
  DocTag,
  IfchangedTag,
  PaginateTag,
  SchemaTag,
  SectionTag,
  SectionsTag,
  ContentForTag,
  StyleTag,
  FormTag,
  StylesheetTag,
  JavascriptTag,
  InlineCommentTag
}
