import * as fs from 'fs'
import * as path from 'path'
const { denodeify } = require('./util')

// TODO: Write tests

// Like a Map, but keys are files in a dir, and object values are written as file contents
exports.JSONFileMap = class JSONFileMap<V> extends Map<string,V> {
  constructor (private dir:string) {
    super()
  }
  private keyToString(key: string): string {
    if (typeof key === 'string') return key
    return JSON.stringify(key)
  }
  ['set'] (key:string, val:V) {
    // coerce to string
    const filePath = path.join(this.dir, key)
    const valString = JSON.stringify(val, null, 2)
    fs.writeFileSync(filePath, valString)
    return this
  }
  ['get'] (key:string) {
    const filePath = path.join(this.dir, this.keyToString(key))
    let fileContents
    try {
      fileContents = fs.readFileSync(filePath, 'utf8')
    } catch (err) {
      switch (err.code) {
        case 'ENOENT':
          // file does not exist. This is common, just means it's not 'in the Map'
          return
      }
    }
    return JSON.parse(fileContents)
  }
  ['delete'] (key:string) {
    fs.unlinkSync(path.join(this.dir, this.keyToString(key)))
    return true
  }
  [Symbol.iterator] () {
    return this.entries()[Symbol.iterator]()
  }
  keys () {
    const dir = this.dir
    const files = fs.readdirSync(dir)
    const sortedAscByCreation: string[] = files
      .map(name => {
        const stat = fs.statSync(path.join(dir, name))
        return ({ name, stat })
      })
      .sort(function (a, b) {
        const timeDelta = a.stat.ctime.getTime() - b.stat.ctime.getTime()
        if (timeDelta === 0) {
          // fall back to assumption of increasing inodes. I have no idea if
          // this is guaranteed, but think it is
          // If this is bad, then maybe this whole method should just use 'ls'
          // (delegate to the OS) since node isn't good enough here
          return a.stat.ino - b.stat.ino
        }
        return timeDelta
      })
      .map(({ name }) => name)
    return sortedAscByCreation[Symbol.iterator]()
  }
  values () {
    return Array.from(this.keys()).map((file: string) => this.get(file))[Symbol.iterator]()
  }
  entries () {
    return Array.from(this.keys()).map((file) => [file, this.get(file)] as [string,V])[Symbol.iterator]()
  }
  get size () {
    return Array.from(this.keys()).length
  }
}

type AsyncMapKey = string
type AsyncMapValue = object
interface IAsyncMap<K, V> {
    clear(): Promise<void>;
    delete(key: K): Promise<boolean>;
    forEach(callbackfn: (value: V, index: K, map: Map<K, V>) => void, thisArg?: any): void;
    get(key: K): Promise<V>;
    has(key: K): Promise<boolean>;
    set(key: K, value?: V): Promise<Map<K, V>>;
    // @TODO (ben) these should really be like Iterator<Promise>
    entries(): Promise<Iterator<[K, V]>>;
    keys(): Promise<Iterator<K>>;
    values(): Promise<Iterator<V>>;
    size: Promise<number>;
}

// Like a Map, but all methods return a Promise
class AsyncMap<K, V> implements IAsyncMap<K,V> {
  async clear() {
    return Map.prototype.clear.call(this)
  }
  async delete(key: K) {
    return Map.prototype.delete.call(this, key)
  }
  forEach(callbackfn: (value: V, index: K, map: Map<K, V>) => void) {
    return Map.prototype.forEach.call(this, callbackfn)
  }
  async get(key: K) {
    return Map.prototype.get.call(this, key)
  }
  async has(key: K) {
    return Map.prototype.has.call(this, key)
  }
  async set(key: K, value: V) {
    return Map.prototype.set.call(this, key, value)
  }
  async entries() {
    return Map.prototype.entries.call(this)
  }
  async keys() {
    return Map.prototype.keys.call(this)
  }
  async values() {
    return Map.prototype.values.call(this)
  }
  get size() {
    return (async () => {
      return Promise.resolve(Array.from(await this.keys()).length)
    })()
  }
}

// Like JSONFileMap, but all methods return Promises of their values
// and i/o is done async
exports.JSONFileMapAsync = class JSONFileMapAsync extends AsyncMap<string, any> implements IAsyncMap<string, any> {
  constructor (private dir:string) {
    super()
  }
  async ['set'] (key:string, val:string|object) {
    // coerce to string
    const filePath = path.join(this.dir, key)
    const valString = typeof val === 'string' ? val : JSON.stringify(val, null, 2)
    return denodeify(fs.writeFile)(filePath, valString)
  }
  async ['get'] (key:string) {
    try {
      return JSON.parse(await denodeify(fs.readFile)(path.join(this.dir, key), 'utf8'))
    } catch (err) {
      switch (err.code) {
        case 'ENOENT':
          // file does not exist. This is common, just means it's not 'in the Map'
          return
        default:
          throw err
      }
    }
  }
  async ['delete'] (key:string) {
    fs.unlinkSync(path.join(this.dir, key))
    return true
  }
  [Symbol.iterator] () {
    return this.keys().then(keys => keys[Symbol.iterator]())
  }
  // todo make async
  async keys () {
    const dir = this.dir
    const files = fs.readdirSync(dir)
    const sortedAscByCreation = files
      .map(name => {
        const stat = fs.statSync(path.join(dir, name))
        return ({ name, stat })
      })
      .sort(function (a, b) {
        const timeDelta = a.stat.ctime.getTime() - b.stat.ctime.getTime()
        if (timeDelta === 0) {
          // fall back to assumption of increasing inodes. I have no idea if
          // this is guaranteed, but think it is
          // If this is bad, then maybe this whole method should just use 'ls'
          // (delegate to the OS) since node isn't good enough here
          return a.stat.ino - b.stat.ino
        }
        return timeDelta
      })
      .map(({ name }) => name)
    return sortedAscByCreation[Symbol.iterator]()
  }
  async values () {
    const files = await this.keys()
    const values = await Promise.all(Array.from(files).map(file => this.get(file)))
    return values[Symbol.iterator]()
  }
  async entries () {
    const files = await this.keys()
    const entries = await Promise.all(Array.from(files).map(async (key) => {
      return [key, await this.get(key)] as [string, any]
    }))
    const entriesIterator = entries[Symbol.iterator]()
    return entriesIterator
  }
  get size () {
    return Promise.resolve(this.keys()).then(files => Array.from(files).length)
  }
}
