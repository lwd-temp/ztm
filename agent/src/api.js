import db from './db.js'
import Mesh from './mesh.js'

//
// Data sources:
//   Local storage:
//     - Meshes
//     - Services (self)
//     - Ports
//   Mesh:
//     - Endpoints
//     - Services (others)
//

var meshes = {}

function findMesh(name) {
  var m = meshes[name]
  if (m) return m
  throw `Mesh not found: ${name}`
}

function init() {
  db.allMeshes().forEach(
    function (mesh) {
      meshes[mesh.name] = Mesh(mesh)
    }
  )
}

function allMeshes() {
  return Object.values(meshes).map(
    (mesh) => ({
      ...mesh.config,
      connected: mesh.isConnected(),
      errors: mesh.getErrors(),
    })
  )
}

function getMesh(name) {
  var mesh = meshes[name]
  if (mesh) {
    return {
      ...mesh.config,
      connected: mesh.isConnected(),
      errors: mesh.getErrors(),
    }
  }
  return null
}

function setMesh(name, mesh) {
  db.setMesh(name, mesh)
  var old = meshes[name]
  if (old) {
    old.leave()
    delete meshes[name]
  }
  mesh = db.getMesh(name)
  meshes[name] = Mesh(mesh)
  return getMesh(name)
}

function delMesh(name) {
  db.delMesh(name)
  var old = meshes[name]
  if (old) {
    old.leave()
    delete meshes[name]
  }
}

function allEndpoints(mesh) {
  mesh = meshes[mesh]
  if (!mesh) return Promise.resolve([])
  var id = mesh.config.agent.id
  return mesh.discoverEndpoints().then(
    list => list.map(ep => ({ ...ep, isLocal: (ep.id === id) }))
  )
}

function getEndpoint(mesh, ep) {
  mesh = meshes[mesh]
  if (!mesh) return Promise.resolve(null)
  return mesh.findEndpoint(ep)
}

function allServices(mesh, ep) {
  var m = findMesh(mesh)
  if (!m) return Promise.resolve([])
  if (ep && ep !== m.config.agent.id) {
    return m.remoteQueryServices(ep)
  } else {
    return m.discoverServices(ep).then(
      function (list) {
        list.forEach(svc => {
          svc.isDiscovered = true
          svc.isLocal = false
        })
        if (!ep || ep === m.config.agent.id) {
          db.allServices().forEach(
            function (local) {
              var name = local.name
              var protocol = local.protocol
              var svc = list.find(s => s.name === name && s.protocol === protocol)
              if (svc) {
                svc.isLocal = true
                svc.host = local.host
                svc.port = local.port
              } else {
                list.push({
                  name,
                  protocol,
                  endpoints: [{
                    id: m.config.agent.id,
                    name: m.config.agent.name,
                  }],
                  isDiscovered: false,
                  isLocal: true,
                  host: local.host,
                  port: local.port,
                })
              }
            }
          )
        }
        var id = m.config.agent.id
        list.forEach(svc => (
          svc.endpoints.forEach(ep => {
            if (ep.id === id) ep.isLocal = true
          })
        ))
        return list
      }
    )
  }
}

function getService(mesh, ep, proto, name) {
  return allServices(mesh, ep).then(
    list => list.find(s => s.name === name && s.protocol === proto) || null
  )
}

function setService(mesh, ep, proto, name, service) {
  var m = findMesh(mesh)
  if (ep === m.config.agent.id) {
    m.publishService(proto, name, service.host, service.port)
    db.setService(mesh, proto, name, service)
    return getService(mesh, ep, proto, name)
  } else {
    return m.remotePublishService(ep, proto, name, service.host, service.port)
  }
}

function delService(mesh, ep, proto, name) {
  var m = findMesh(mesh)
  if (ep === m.config.agent.id) {
    m.deleteService(proto, name)
    db.delService(mesh, proto, name)
    return Promise.resolve()
  } else {
    return m.remoteDeleteService(ep, proto, name)
  }
}

function allUsers(mesh, ep, svc) {
}

function getUser(mesh, ep, svc, name) {
}

function setUser(mesh, ep, svc, name, user) {
}

function delUser(mesh, ep, svc, name) {
}

function allPorts(mesh, ep) {
  var m = findMesh(mesh)
  if (!m) return Promise.resolve([])
  if (ep === m.config.agent.id) {
    return Promise.resolve(db.allPorts(mesh))
  } else {
    return m.remoteQueryPorts(ep)
  }
}

function getPort(mesh, ep, ip, proto, port) {
  return allPorts(mesh, ep).then(
    list => list.find(p => p.listen.port === port && p.listen.ip === ip && p.protocol === proto) || null
  )
}

function setPort(mesh, ep, ip, proto, port, target) {
  var m = findMesh(mesh)
  if (ep === m.config.agent.id) {
    m.openPort(ip, proto, port, target.service, target.endpoint)
    db.setPort(mesh, ip, proto, port, { target })
    return getPort(mesh, ep, ip, proto, port)
  } else {
    return m.remoteOpenPort(ep, ip, proto, port, target)
  }
}

function delPort(mesh, ep, ip, proto, port) {
  var m = findMesh(mesh)
  if (ep === m.config.agent.id) {
    m.closePort(ip, proto, port)
    db.delPort(mesh, ip, proto, port)
    return Promise.resolve()
  } else {
    return m.remoteClosePort(ep, ip, proto, port)
  }
}

export default {
  init,
  allMeshes,
  getMesh,
  setMesh,
  delMesh,
  allEndpoints,
  getEndpoint,
  allServices,
  getService,
  setService,
  delService,
  allUsers,
  getUser,
  setUser,
  delUser,
  allPorts,
  getPort,
  setPort,
  delPort,
}