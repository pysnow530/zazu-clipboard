const readableFormat = require('./lib/readableFormat')
const CappedClient = require('./lib/cappedClient')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const mkdirp = require('mkdirp')

module.exports = (pluginContext) => {
  const { cwd, clipboard } = pluginContext

  const sha1 = (message) => crypto.createHash('sha1').update(message).digest().toString('hex')

  const isTransient = () => {
    const badTypes = [
      'de.petermaurer.TransientPasteboardType',
      'com.typeit4me.clipping',
      'Pasteboard generator type',
      'com.agilebits.onepassword',
      'org.nspasteboard.TransientType',
      'org.nspasteboard.ConcealedType',
      'org.nspasteboard.AutoGeneratedType',
    ]
    return badTypes.find((badType) => {
      return clipboard.has(badType)
    })
  }

  const getClip = (ignoreImages) => {
    const clip = {}
    if (ignoreImages) {
      clip.type = 'text'
    } else {
      clip.image = clipboard.readImage()
      clip.type = clip.image.isEmpty() ? 'text' : 'image'
    }

    if (clip.type === 'image') {
      //  For image, the 'clip.raw' is its persistent file location
      clip.raw = path.join('data', 'images', `${Date.now()}.jpeg`)
      //  Generate hash for later comparison
      if (process.platform === 'win32' || process.platform === 'darwin') {
        //  We use getBitmap() for hashing which is fastest
        clip.hash = sha1(clip.image.getBitmap())
      } else {
        //  For Linux system, we use toDataURL() for hashing,
        //  as getBitmap() and toBitmap() is quite slow on Linux.
        clip.hash = sha1(clip.image.toDataURL())
      }
      return clip
    }

    clip.raw = clipboard.readText()
    clip.hash = sha1(clip.raw)
    delete clip.image
    return clip
  }

  const processImage = (clip) => {
    if (clip.type !== 'image' || clip.raw.length === 0 || !clip.image) {
      return
    }

    // Although toPNG()'s performance isn't good, it's better than toDataURL(), and support transparency.
    const imageData = clip.image.toPNG()

    //  Create base directory if it doesn't exist.
    const f = path.join(cwd, clip.raw)
    const basedir = path.dirname(f)
    if (!fs.existsSync(basedir)) {
      mkdirp(basedir)
    }

    //  Save the image to disk
    fs.writeFile(f, imageData, err => {
      if (err) {
        console.log('error', `ERROR: Failed to save image: ${clip.raw}\n\t ${err}`)
      } else {
        console.log('info', `Successfully saved image: ${clip.raw}`)
      }
    })

    //  Generate title based on the image's dimension and size
    const dimensions = clip.image.getSize()
    const size = readableFormat(imageData.length)
    clip.title = `Image: ${dimensions.width}x${dimensions.height} (${size.value}${size.unit})`
  }

  let lastClip
  const monitor = (env = {}) => {
    return new Promise((resolve, reject) => {
      if (isTransient()) {
        resolve()
      } else {
        const clip = getClip(env.ignoreImages)
        //  Check if it's new clip
        if (clip.raw.length > 0 && (!lastClip || lastClip.type !== clip.type || lastClip.hash !== clip.hash)) {
          if (clip.type === 'image') {
            //  process image clip first
            processImage(clip)
          }
          lastClip = clip
          //  Add to database
          const clipCollection = CappedClient.init(cwd, env)
          resolve(clipCollection.upsert(clip))
        } else {
          resolve()
        }
      }
    })
  }

  //  As there is a performance hit of clipboard on Linux platform,
  //  Here we let Linux have more interval than other platform by default.
  //  See also: https://github.com/tinytacoteam/zazu/issues/189
  const DEFAULT_INTERVAL = (process.platform === 'linux' ? 3000 : 1000)
  //  Let the minimum interval be 250ms, which is a little bit higher than
  //  default minimum plugin system interval 100ms, for less CPU intense.
  const MINIMUM_INTERVAL = 250

  //  interval value check
  const parseInterval = (updateInterval) => {
    const interval = parseInt(updateInterval, 10)
    if (isNaN(interval)) {
      return DEFAULT_INTERVAL
    } else if (interval < MINIMUM_INTERVAL) {
      return MINIMUM_INTERVAL
    } else {
      return interval
    }
  }

  //  We use a loop here to provide user the ability to customize the interval.
  //  it will keep looping unless got an exception.
  const start = (env = {}) => new Promise((resolve) => {
    setTimeout(resolve, parseInterval(env.updateInterval))
  }).then(() => monitor(env)).then(() => start(env))

  return start
}
