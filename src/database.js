const emitter = require('./lib/ipc')
const CappedCollection = require('./lib/cappedCollection')

module.exports = (pluginContext) => {

  const cwd = pluginContext.cwd
  const clipCollection = new CappedCollection('clipCollection', {
    cwd,
  })

  emitter.on('last', (cb) => {
    clipCollection.last().then(cb)
  })

  emitter.on('findOne', (_id, cb) => {
    clipCollection.findOne(_id).then(cb)
  })

  emitter.on('upsert', (doc, userOptions, cb) => {
    clipCollection.upsert(doc, userOptions).then(cb)
  })

  emitter.on('all', (cb) => {
    clipCollection.all().then(cb)
  })

  return (env = {}) => {
    const size = env.size || 50
    clipCollection.setSize(size)
    return Promise.resolve('ping')
  }
}
