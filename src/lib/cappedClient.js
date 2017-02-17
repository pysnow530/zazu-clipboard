const fs = require('fs')
const path = require('path')
const CappedCollection = require('./cappedCollection')

class CappedClient {
  constructor (cwd, env = {}, logger) {
    this.cwd = cwd
    this.clipCollection = new CappedCollection('clipCollection', { cwd })
    this.clipCollection.setSize(env.size || 50)
    this.clipCollection.setOnRemove(doc => this.removeCacheImage(doc))
    this.console = logger
  }

  log (level, message) {
    if (this.console) {
      this.console.log(level, message)
    } else {
      console.log(`${level}: ${message}`)
    }
  }

  last () {
    return this.clipCollection.last()
  }

  findOne (_id) {
    return this.clipCollection.findOne(_id)
  }

  upsert (doc, userOptions) {
    return this.clipCollection.upsert(doc, userOptions)
  }

  all () {
    return this.clipCollection.all()
  }

  removeCacheImage (clip) {
    return new Promise((resolve, reject) => {
      if (clip.raw) {
        const f = path.join(this.cwd, clip.raw)
        fs.access(f, fs.constants.R_OK | fs.constants.W_OK, (err) => {
          if (err) {
            //  We don't want to stop the execution for error
            //  so, output error log and continue
            this.log('error', `'${clip.name}': ${err}`)
            resolve()
          } else {
            fs.unlink(f, (err) => {
              if (err) {
                this.log('error', `'${clip.name}': ${err}`)
                resolve()
              } else {
                resolve(f)
              }
            })
          }
        })
      } else {
        this.log('error', `clip.raw is empty for '${clip.name}'`)
        resolve()
      }
    })
  }
}

var client = null
module.exports = {
  init: (cwd, env) => {
    if (!client) {
      client = new CappedClient(cwd, env)
    }
    return client
  },
  clear: () => {
    client = null
  },
}
