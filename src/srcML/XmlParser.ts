/**
 * This program has been developed by students from the bachelor Computer Science at Utrecht University within the Software Project course.
 * � Copyright Utrecht University (Department of Information and Computing Sciences)
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import md5 from 'md5';
import HashData from '../HashData';
import { Language } from '../Parser';
import { ParserBase } from '../ParserBase';
import { execSync } from 'child_process';
import { Node, TagData } from './Node';
import StringStream from './StringStream';
import { GetHashable } from './AbstractionData';
import Logger from '../searchSECO-logger/src/Logger';
import path from 'path';

export default class XMLParser extends ParserBase {
	private readonly _language: Language;
	private _inFunction = false;
	private _parseFurther = true;
	private _hashes: HashData[] = [];
	private _current: Node;
	private _tree: Node;
	private readonly _minFunctionChars: number;
	private readonly _minFunctionLines: number;
	private _lineNumber = 0;
	private _startLastFunction = 0;
	private _currentFileName = '';
	private _functionCount = 0;
	private _currentFile = 0;

	constructor(basePath: string, lang: Language, minFunctionChars = 0, minFunctionLines = 0) {
		super(basePath);
		this._language = lang;
		this._minFunctionChars = minFunctionChars;
		this._minFunctionLines = minFunctionLines;
	}

	private getNextTag(stream: StringStream): TagData {
		const textBefore = stream.GetDataUntil(['<'], true).output;
		let textIn = '';
		const { output: tag, brokeOn } = stream.GetDataUntil([' ', '>'], false);
		if (brokeOn === ' ') {
			textIn = stream.GetDataUntil(['>'], false).output;
		}
		this._lineNumber = stream.GetLastLineNumber();
		return new TagData(tag, textBefore, textIn);
	}

	private handleClosingTag(tagData: TagData) {
		if (tagData.tag.substring(1) !== this._current.GetTag()) {
			Logger.Debug(
				`Closing tags don't line up in ${this._currentFileName} on line ${this._lineNumber}, skipping function`,
				Logger.GetCallerLocation()
			);

			this._tree = new Node('unknown');
			this._current = this._tree;
			this._inFunction = false;
			return;
		}
		const prev = this._current.GetPrevious();
		if (this._current.GetTag() === 'function' && this._parseFurther) {
			const ab = GetHashable(this._current);
			if (
				ab.GetString().length > this._minFunctionChars &&
				this._lineNumber - this._startLastFunction > this._minFunctionLines
			) {
				this._hashes.push(
					new HashData(
						md5(ab.GetString()),
						this._currentFileName,
						ab.GetFunctionName(),
						this._startLastFunction,
						this._lineNumber
					)
				);
				this._functionCount++;
			}

			prev.RemoveNode(this._current);
			this._inFunction = false;
			this._current = undefined;
		}
		this._current = prev;
	}

	private handleOpeningTag(tagData: TagData) {
		if (tagData.tag !== 'function' && !this._inFunction) {
			// Maybe require a unit tag handling, but for for now it's not needed
			// if (tagData.tag === "unit")
			//     this.handleUnitTag(tagData)
			return;
		} else if (tagData.tag === 'function') {
			this._inFunction = true;
			this._startLastFunction = this._lineNumber;
		}

		if (tagData.tag[tagData.tag.length - 1] === '/') tagData.tag = tagData.tag.slice(0, -1) + ' /';

		const node = new Node(tagData.tag, tagData.textInTag, this._current);
		this._current.AddNode(node);
		if (!(tagData.textInTag.length > 0 && tagData.textInTag[tagData.textInTag.length - 1] === '/')) {
			this._current = node;
		}
	}

	// handleUnitTag implementation here
	// private handleUnitTag(tagData: TagData) {

	// }

	private parseXMLStream(stream: StringStream): HashData[] {
		this._tree = new Node('unknown');
		const firstTag = this.getNextTag(stream);
		if (stream.Empty() && firstTag.tag === '') {
			Logger.Debug('SrcML returned nothing', Logger.GetCallerLocation());
			return [];
		}
		if (firstTag.tag !== '?xml') {
			this._tree = undefined;
			Logger.Debug(`Wrong first tag: tag was ${firstTag.tag}`, Logger.GetCallerLocation());
			return [];
		}
		this._current = this._tree;

		while (!stream.Empty()) {
			const tagData = this.getNextTag(stream);

			if (tagData.textBefore !== '' && this._inFunction)
				this._current.AddNode(new Node(this._current.GetTag(), tagData.textBefore, this._current));

			if (tagData.tag[0] === '/' && this._inFunction) this.handleClosingTag(tagData);
			else if (tagData.tag.substring(0, 7) === 'comment')
				while (this.getNextTag(stream).tag !== '/comment') {
					/* consume chars until a closing comment tag has been found */
				}
			else {
				this.handleOpeningTag(tagData);
			}
		}
		return this._hashes;
	}

	private parseToXML(path: string): string {
		const cmd = `srcml "${path}" -l ${this._language}`;
		try {
			const stdout = execSync(cmd);
			return stdout.toString();
		} catch (err) {
			return '';
		}
	}

	protected async parseSingle(basePath: string, fileName: string): Promise<HashData[]> {
		return new Promise((resolve) => {
			const xmlString = this.parseToXML(path.join(basePath, fileName));
			this._currentFileName = fileName;
			const hashes = this.parseXMLStream(new StringStream(xmlString));
			this.Reset();
			Logger.Debug(
				`Finished parsing file ${fileName}. Number of functions found: ${hashes.length}`,
				Logger.GetCallerLocation()
			);
			resolve(hashes);
		});
	}

	private Reset() {
		this._inFunction = false;
		this._parseFurther = true;
		this._hashes = [];
		this._current = undefined;
		this._tree = undefined;
		this._lineNumber = 0;
		this._startLastFunction = 0;
		this._currentFileName = '';
		this._functionCount = 0;
	}
}
