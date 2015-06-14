
var chai = require('chai');

chai.use(require('sinon-chai'));
chai.use(require('chai-things'));
chai.use(require('chai-as-promised'));

global.expect = chai.expect;
