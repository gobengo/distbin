const fs = require('fs')
const path = require('path')

// A Map that reads/writes keys from files in a directory
// Can only store Strings
// Oh also get/set return Promises
const FileMapPrivates = {
  dir: Symbol('dir')
}
exports.FileMap = class FileMap extends Map {
  constructor (dir) {
    super()
    this[FileMapPrivates.dir] = dir
  }
  async ['set'](key, val) {
    // coerce to string
    const filePath = path.join(this[FileMapPrivates.dir], key);
    const valString = typeof val === 'string' ? val : JSON.stringify(val, null, 2)
    console.log('filemap#set',this[FileMapPrivates.dir], key)
    const writeFile = () => new Promise((resolve, reject) => {
      fs.writeFile(filePath, valString, err => {
        debugger;
        if (err) return reject(err)
        resolve()
      })
    })
    return await writeFile()
  }
  async ['get'](key) {
    return new Promise((resolve, reject) => {
      const filePath = path.join(this[FileMapPrivates.dir], key);
      fs.readFile(filePath, 'utf8', (err, data) => {
        if ( ! err) return resolve(JSON.parse(data))
        switch (err.code) {
          case 'ENOENT':
            // file does not exist. This is common, just means it's not 'in the map'
            resolve();
            return;
        }
        return reject(err);
      })
    })
  }
  values() {
    throw new Error("TODO: need to listdir to be able to iterate values and for publiCollection to work")
  }
}
