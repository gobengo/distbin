import { ASObject } from "../test/types";
import { get } from 'lodash'
import { JSONFileMapAsync, IAsyncMap } from '../src/filemap'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
const { debuglog, denodeify } = require('../src/util');

type InboxFilter = (obj: ASObject) => Promise<Boolean>

interface IDistbinConfig {
    activities: IAsyncMap<string, any>
    deliverToLocalhost: Boolean
    externalUrl?: string
    internalUrl?: string
    inbox: IAsyncMap<string, any>
    inboxFilter: InboxFilter
    port?: number
}

export default async (): Promise<IDistbinConfig> => {
    const dbDir = await initDbDir(process.env.DB_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'distbin-')))
    debuglog("using db directory", dbDir)    
    return {
        activities: new JSONFileMapAsync(path.join(dbDir, 'activities/')),
        deliverToLocalhost: ('DISTBIN_DELIVER_TO_LOCALHOST' in process.env)
            ? JSON.parse(process.env.DISTBIN_DELIVER_TO_LOCALHOST)
            : process.env.NODE_ENV !== 'production',
        externalUrl: process.env.EXTERNAL_URL,
        internalUrl: process.env.INTERNAL_URL,
        inbox: new JSONFileMapAsync(path.join(dbDir, 'inbox/')),
        inboxFilter: objectContentFilter(['viagra']),
        port: parsePort(process.env.PORT || process.env.npm_package_config_port),
    }
}

function parsePort (portStr: string|undefined): number|undefined {
    const portNum = parseInt(portStr)
    if (isNaN(portNum)) return
    return portNum
}

/**
 * Create an inboxFilter that blocks incoming activities whose .object.content contains any of the provided substrings
 * @param shouldNotContain list of substrings that incoming objects must not have in their content
 */
function objectContentFilter (shouldNotContain: string[]): (obj: ASObject) => Promise<Boolean> {
    return async (obj: ASObject) => {
        const content: string = get(obj, 'object.content', '').toLowerCase()
        return ! shouldNotContain.some(substring => {
            return content.includes(substring)
        })
    }
}

async function initDbDir (dbDir: string): Promise<string> {
    // ensure subdirs exist
	await Promise.all(['activities', 'inbox'].map(dir => {
		return denodeify(fs.mkdir)(path.join(dbDir, dir))
		.catch((err: NodeJS.ErrnoException) => {
			switch (err.code) {
				case 'EEXIST':
					// folder exists, no prob
					return;
			}
			throw err;
		})
    }));
    return dbDir
}
