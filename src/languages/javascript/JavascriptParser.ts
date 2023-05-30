import HashData from "../../HashData";
import { ParserBase } from "../../ParserBase";
import { ANTLRInputStream, CommonTokenStream, TokenStreamRewriter } from 'antlr4ts';
import { ParseTreeWalker } from 'antlr4ts/tree/ParseTreeWalker'
import { JavaScriptLexer } from "./lib/JavaScriptLexer";
import { JavaScriptParser, ProgramContext } from "./lib/JavaScriptParser"
import JSListener from "./lib/JavaScriptParserListenerDerived";
import Logger from "../../searchSECO-logger/src/Logger";

/**
 * The implementation of a Javascript parser. This parser inherits from `ParserBase`.
 */
export default class Javascript extends ParserBase {
    private _minMethodSize: number
    private _minFunctionChars: number

    constructor(minMethodSize: number, minFunctionChars: number) {
        super(false)
        this._minMethodSize = minMethodSize
        this._minFunctionChars = minFunctionChars
    }

    protected override parseSingle(data: string, filename: string): Promise<HashData[]> {
        const chars = new ANTLRInputStream(data)
        const lexer = new JavaScriptLexer(chars)
        const tokens = new CommonTokenStream(lexer)

        try {
            tokens.fill()
        } catch(e) {
            Logger.Warning(`Error while tokenizing file: ${filename}, skipping. Error: ${e}`, Logger.GetCallerLocation())
            return Promise.resolve([])
        }

        const parser = new JavaScriptParser(tokens)
        parser.removeErrorListeners()
        const rewriter = new TokenStreamRewriter(tokens)

        parser.buildParseTree = true

        let tree: ProgramContext
        try {
            tree = parser.program()
        } catch (e) {
            Logger.Warning(`Error while walking file: ${filename}, skipping. Error: ${e}`, Logger.GetCallerLocation())
            return Promise.resolve([])
        }

        const listener = new JSListener(rewriter, filename, this._minMethodSize, this._minFunctionChars)

        ParseTreeWalker.DEFAULT.walk(listener, tree)

        const hashes = listener.GetData()
        Logger.Debug(`Finished parsing file ${filename}. Number of functions found: ${hashes.length}`, Logger.GetCallerLocation())
        return Promise.resolve(hashes)
    }
}
