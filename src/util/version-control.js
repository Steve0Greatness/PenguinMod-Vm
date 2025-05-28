const JSZip = require('jszip');
const sb3 = require('./serialization/sb3');

class VersionControl {
    constructor(vm) {
        this.vm = vm;

        this.branches = new Map();
        this.currentRevision = {
            branch: null,
            revision: null
        };

        this.defaultCurrent = {};
        this.current = this.defaultCurrent;
    }

    addCommit(log, authorship) {
        // TODO
        let mergey_b = JSON.stringify(
            sb3.serialize(),
            (_key, value) => {
                if (typeof value === 'number' &&
                    (value === Infinity || value === -Infinity || isNaN(value))){
                    return 0;
                }
                return value;
            },
            "\n"
        );


    }

    serialize() {
        // TODO
        return {
            fileName: "VERSIONING.ignore",
            fileContent: "empty"
        }
    }

    deserialize(contents) {
        // TODO
    }
}

module.exports = VersionControl
