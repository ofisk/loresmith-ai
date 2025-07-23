// Mock AJV module for testing
export default class Ajv {
  constructor() {
    this.validate = () => true;
    this.addSchema = () => this;
    this.addKeyword = () => this;
    this.addFormat = () => this;
  }
}

export const addFormats = () => {};
export const addKeywords = () => {};
