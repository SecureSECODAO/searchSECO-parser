/**
 * This program has been developed by students from the bachelor Computer Science at Utrecht University within the Software Project course.
 * � Copyright Utrecht University (Department of Information and Computing Sciences)
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import HashData from './HashData';
import { IParser } from './ParserBase';
import JavascriptParser from './languages/javascript/JavascriptParser';
import PythonParser from './languages/python3/PythonParser';
import * as fs from 'fs';
import path from 'path';
import XMLParser from './srcML/XmlParser';
import Logger, { Verbosity } from './searchSECO-logger/src/Logger';

export enum XMLSupportedLanguage {
	CPP = 'C++',
	CSHARP = 'C#',
	JAVA = 'Java',
}

export enum ANTLRSupportedLanguage {
	PYTHON = 'Python',
	JS = 'Javascript',
}

const Language = { ...XMLSupportedLanguage, ...ANTLRSupportedLanguage };
export type Language = XMLSupportedLanguage | ANTLRSupportedLanguage;

const EXCLUDE_PATTERNS = [
	'.git',
	'test',
	'tests',
	'build',
	'dist',
	'demo',
	'docs',
	'node_modules',
	'generated',
	'backup',
	'examples',
    '.min.',
    '-min.'
];

/**
 * Recursively retrieves file paths from all nested subdirectories in a root dir.
 * @param dir The root dir to list files from
 * @returns A list of all file paths found. The paths are relative to the specified dir.
 */
export function getAllFiles(dir: string): string[] {
	function recursivelyGetFiles(currDir: string, acc: string[]): string[] {
		try {
			fs.readdirSync(currDir).forEach((file: string) => {
				if (EXCLUDE_PATTERNS.some((pat) => file.toLowerCase().includes(pat))) return acc;
				const abs_path = path.join(currDir, file);
				try {
					if (fs.statSync(abs_path).isDirectory()) return recursivelyGetFiles(abs_path, acc);
					else acc.push(abs_path);
				} catch (e) {
					return acc;
				}
			});
			return acc;
		} catch (e) {
			return acc;
		}
	}
	return recursivelyGetFiles(dir, []);
}

/**
 * Extracts the filename and language from a given file path
 * @param filepath The path to extract the filename and language from.
 * @returns A tuple containing the filename and the language. If the language is not supported, undefined is returned.
 */
function getFileNameAndLanguage(filepath: string, basePath: string): { filename: string; lang: Language | undefined } {
	const filename = filepath.replace(basePath, '.');
	switch (filename?.split('.').pop()?.toLowerCase()) {
		case 'py':
			return { filename, lang: Language.PYTHON };
		case 'js':
			return { filename, lang: Language.JS };
		case 'cpp':
			return { filename, lang: Language.CPP };
		case 'cs':
			return { filename, lang: Language.CSHARP };
		case 'java':
			return { filename, lang: Language.JAVA };
		default:
			return { filename: filename || '', lang: undefined };
	}
}

const MIN_FUNCTION_CHARS = 0;
const MIN_METHOD_LINES = 0;

/**
 * The Javascript implementation of the SearchSECO parser.
 */
export default class Parser {
	constructor(verbosity: Verbosity) {
		Logger.SetModule('parser');
		Logger.SetVerbosity(verbosity);
	}

	/**
	 * Parses a list of files or a whole directory based on a path. This method is static.
	 * @param basePath The path of the directory to parse all files from
	 * @returns A tuple containing the list of filenames parsed, and a Map. The keys of this map are the file names,
	 * and the values are HashData objects containing data about the parsed functions.
	 */
	public async ParseFiles(basePath: string): Promise<{ filenames: string[]; result: HashData[] }> {
		const parsers = new Map<Language, IParser>([
			[Language.JS, new JavascriptParser(basePath, MIN_METHOD_LINES, MIN_FUNCTION_CHARS)],
			[Language.PYTHON, new PythonParser(basePath, MIN_METHOD_LINES, MIN_FUNCTION_CHARS)],
			[Language.CPP, new XMLParser(basePath, Language.CPP, MIN_FUNCTION_CHARS, MIN_METHOD_LINES)],
			[Language.CSHARP, new XMLParser(basePath, Language.CSHARP, MIN_FUNCTION_CHARS, MIN_METHOD_LINES)],
			[Language.JAVA, new XMLParser(basePath, Language.JAVA, MIN_FUNCTION_CHARS, MIN_METHOD_LINES)],
		]);

		const files = getAllFiles(basePath);

		const filenames: string[] = [];
		files.forEach((file) => {
			const { filename, lang } = getFileNameAndLanguage(file, basePath);

			if (!lang) {
				return;
			}

			filenames.push(filename);
			const parser = parsers.get(lang);
			if (!parser) {
				Logger.Debug(`Could not associate a parser with specified language`, Logger.GetCallerLocation());
				return;
			}

			Logger.Debug(`Parsing ${filename}`, Logger.GetCallerLocation());
			parser.AddFile(filename);
		});

		Logger.Info(`Parsing ${filenames.length} files`, Logger.GetCallerLocation());
		const parserResults = await Promise.all(Array.from(parsers.values()).map((p) => p.Parse()));
		parsers.clear();

		return { filenames, result: parserResults.flat() };
	}
}
