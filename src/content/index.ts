// Loads all content modules (fixtures register themselves on import).
import './fixtures/lab';
import './missions';
import './cases';
import './arena';

export { buildFixture, hasFixture } from './fixtures';
