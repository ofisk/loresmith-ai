// Mock implementation of ajv to prevent ES module issues
class MockAjv {
  addSchema() {}
  validate() {
    return true;
  }
  addFormat() {}
  addKeyword() {}
  getSchema() {
    return null;
  }
  removeSchema() {}
  validateSchema() {
    return true;
  }
}

module.exports = MockAjv;
module.exports.default = MockAjv;
