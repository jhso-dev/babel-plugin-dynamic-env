const types = require('@babel/types')
const babylon = require('@babel/parser')

const fs = require("fs")
const path = require("path")

const NEWLINE = "\n"
const RE_INI_KEY_VAL = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/
const RE_NEWLINES = /\\n/g
const NEWLINES_MATCH = /\n|\r|\r\n/

function dotEnvConfig(options) {
    const filePath = options.path
    const encoding = options.encoding || "utf8"
    const debug = options.debug || false
    const exclusion = options.exclusion || []
    const dotEnvPath = path.resolve(process.cwd(), filePath)
    try {
        const parsed = dotEnvParse(fs.readFileSync(dotEnvPath, { encoding: encoding }), { debug: debug })
        const excludedEnv = Object.keys(parsed).reduce(function (env, key) {
            if (!exclusion.includes(key)) {
                env[key] = parsed[key]
            }
            return env
        }, {})
        return excludedEnv
    }
    catch (e) {
        return {}
    }
}

function dotEnvParse(src) {
    const obj = {}

    src.toString().split(NEWLINES_MATCH).forEach(function (line, idx) {
        const keyValueArr = line.match(RE_INI_KEY_VAL)
        if (keyValueArr != null) {
            const key = keyValueArr[1]
            let val = (keyValueArr[2] || "")
            const end = val.length - 1
            const isDoubleQuoted = val[0] === '"' && val[end] === '"'
            const isSingleQuoted = val[0] === "'" && val[end] === "'"

            if (isSingleQuoted || isDoubleQuoted) {
                val = val.substring(1, end)
                if (isDoubleQuoted) {
                    val = val.replace(RE_NEWLINES, NEWLINE)
                }
            } else {
                val = val.trim()
            }

            obj[key] = val
        }
    })

    return obj
}

const isGlobal = binding => !binding

function isReplaceableGlobal(node, parent, scope, opts) {
    if (!types.isIdentifier(node)) {
        return false
    }

    if (!Object.hasOwnProperty.call(opts, node.name)) {
        return false
    }

    return (
        isGlobal(scope.getBinding(node.name)) &&
        !types.isMemberExpression(parent) &&
        !(types.isObjectProperty(parent) && parent.key === node)
    )
}

function getAstFromValue(value) {
    switch (typeof value) {
        case "string":
            return types.stringLiteral(value)
        case "boolean":
            return types.booleanLiteral(value)
        case "number":
            return types.numericLiteral(value)
        case "undefined":
            return types.unaryExpression("void", types.numericLiteral(0), true)
    }

    return babylon.parseExpression(JSON.stringify(value))
}

module.exports = function replaceGlobal() {
    return {
        visitor: {
            Identifier(path, state) {
                if (isReplaceableGlobal(path.node, path.parent, path.scope, state.opts)) {
                    const totalDotEnv = Object.keys(state.opts[path.node.name]).reduce(function (prev, current) {
                        prev[current] = dotEnvConfig({ path: state.opts[path.node.name][current] })
                        return prev
                    }, {})

                    path.replaceWith(getAstFromValue(JSON.stringify(totalDotEnv)))
                }
            },
        },
    }
}
