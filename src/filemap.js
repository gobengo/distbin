const fs = require('fs')
const path = require('path')
const { denodeify } = require('./util')

// A Map that reads/writes keys from files in a directory
// Can only store Strings
// Oh also get/set return Promises
const FileMapPrivates = {
  dir: Symbol('dir')
}

// TODO: Write tests

// Like a Map, but keys are files in a dir, and object values are written as file contents
exports.JSONFileMap = class JSONFileMap extends Map {
  constructor (dir) {
    super()
    this[FileMapPrivates.dir] = dir
  }
  ['set'] (key, val) {
    // coerce to string
    const filePath = path.join(this[FileMapPrivates.dir], key)
    const valString = typeof val === 'string' ? val : JSON.stringify(val, null, 2)
    fs.writeFileSync(filePath, valString)
    return this
  }
  ['get'] (key) {
    const filePath = path.join(this[FileMapPrivates.dir], key)
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
  ['delete'] (key) {
    throw new Error('TODO implement JSONFileMap#delete')
  }
  keys () {
    return fs.readdirSync(this[FileMapPrivates.dir])
  }
  values () {
    return Array.from(this.keys()).map(file => this.get(file))
  }
  entries () {
    return Array.from(this.keys()).map(file => [file, this.get(file)])
  }
  get size () {
    return Array.from(this.keys()).length
  }
}

// Like JSONFileMap, but all methods return Promises of their values
// and i/o is done async
exports.JSONFileMapAsync = class JSONFileMapAsync extends Map {
  constructor (dir) {
    super()
    this[FileMapPrivates.dir] = dir
  }
  async ['set'] (key, val) {
    // coerce to string
    const filePath = path.join(this[FileMapPrivates.dir], key)
    const valString = typeof val === 'string' ? val : JSON.stringify(val, null, 2)
    return denodeify(fs.writeFile)(filePath, valString)
  }
  async ['get'] (key) {
    try {
      return JSON.parse(await denodeify(fs.readFile)(path.join(this[FileMapPrivates.dir], key), 'utf8'))
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
  ['delete'] (key) {
    throw new Error('TODO implement JSONFileMap#delete')
  }
  async keys () {
    return denodeify(fs.readdir)(this[FileMapPrivates.dir])
  }
  async values () {
    const files = await this.keys()
    const values = await Promise.all(files.map(file => this.get(file)))
    return values
  }
  async entries () {
    const files = await this.keys()
    return Promise.all(files.map(async function (file) {
      return [file, await this.get(file)]
    }.bind(this)))
  }
  get size () {
    return Promise.resolve(this.keys()).then(files => files.length)
  }
}
