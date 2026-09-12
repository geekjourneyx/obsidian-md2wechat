import { expect, test, vi } from "vitest";
const review=vi.hoisted(()=>({open:vi.fn()}));
vi.mock("obsidian", () => ({ItemView:class{},Modal:class{},FuzzySuggestModal:class{},Notice:class{}}));
vi.mock("./creation-modals",()=>({DraftReviewModal:class{open(){review.open();}},AgentConnectModal:class{},TitlesModal:class{},CoversModal:class{},PolishModal:class{},ParagraphModal:class{},ChangesModal:class{}}));
vi.mock("node:fs/promises",()=>({readFile:vi.fn(async(path:string)=>path==="response"?JSON.stringify({data:{render:{theme:"chosen"},inspect:{context:{font_size:"large"}}}}):path==="fresh"?"新文和已固定图片":"已采用的润色和配图")}));
import { Md2WechatView } from "../../view";
import { hash } from "../results/result-store";
function fixture(source:string){
 const candidate={};const plugin:any={source:vi.fn(async()=>({markdown:source})),previewOriginal:vi.fn(),capture:vi.fn(async()=>({inputFile:"fresh",sourceHash:hash(source),assets:[{localFile:"new image"}]})),creation:{prepare:vi.fn(async()=>candidate),adopt:vi.fn()}};
 const view=new Md2WechatView({} as any,plugin) as any;view.sourcePath="article.md";view.result={id:"old",sourcePath:"article.md",sourceHash:hash("原文"),state:source==="原文"?"current":"source_changed",previewResponseFile:"response",markdownFile:"adopted",assets:[{localFile:"adopted image"}]};view.run=async(action:any)=>action();return {view,plugin,candidate};
}
test("refresh keeps adopted edits and images when source is unchanged",async()=>{
 review.open.mockClear();const {view,plugin,candidate}=fixture("原文");await view.refreshLayout();
 expect(plugin.creation.prepare).toHaveBeenCalledWith("article.md","已采用的润色和配图",[],"已采用的润色和配图",undefined,"原文",expect.objectContaining({baseResultId:"old",assets:[{localFile:"adopted image"}]}));
 expect(plugin.creation.adopt).toHaveBeenCalledWith(candidate);expect(plugin.capture).not.toHaveBeenCalled();expect(review.open).not.toHaveBeenCalled();
});
test("updated source creates a review candidate and never adopts before confirmation",async()=>{
 review.open.mockClear();const {view,plugin}=fixture("新原文");await view.refreshLayout();
 expect(plugin.creation.prepare).toHaveBeenCalledWith("article.md","新文和已固定图片",[],"已采用的润色和配图",undefined,"新原文",expect.objectContaining({baseResultId:"old",assets:[{localFile:"new image"}],theme:"chosen",fontSize:"large"}));
 expect(plugin.creation.adopt).not.toHaveBeenCalled();expect(plugin.previewOriginal).not.toHaveBeenCalled();expect(review.open).toHaveBeenCalledOnce();
});
test("basic layout with an adopted draft uses original source but waits for confirmation",async()=>{
 review.open.mockClear();const {view,plugin}=fixture("原文");await view.basicLayout();
 expect(plugin.capture).toHaveBeenCalledWith("article.md");
 expect(plugin.creation.prepare).toHaveBeenCalledWith("article.md","新文和已固定图片",[],"已采用的润色和配图",undefined,"原文",expect.objectContaining({baseResultId:"old"}));
 expect(plugin.creation.adopt).not.toHaveBeenCalled();expect(plugin.previewOriginal).not.toHaveBeenCalled();expect(review.open).toHaveBeenCalledOnce();
});
test("first basic layout still opens the ordinary preview",async()=>{
 const {view,plugin}=fixture("原文");view.result=null;await view.basicLayout();
 expect(plugin.previewOriginal).toHaveBeenCalledWith("article.md");expect(plugin.creation.prepare).not.toHaveBeenCalled();
});
