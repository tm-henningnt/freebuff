import {
  FREEBUFF_FABLE_5_MODEL_ID,
  FREEBUFF_GEMINI_38_FLASH_MODEL_ID,
  FREEBUFF_MODELS,
} from '@codebuff/common/constants/freebuff-models'
import {
  formatFreebuffModelCatalogTable,
  getFreebuffModelCatalog,
  type FreebuffModelCatalogEntry,
} from '../delegated-run'

const catalog: FreebuffModelCatalogEntry[] = [
  {
    id: 'example/model',
    displayName: 'Example Model',
    tagline: 'Fast coding model',
    availability: 'deployment_hours',
    premium: true,
    multimodal: true,
    warning: 'May use data for AI training',
    dataUse: 'training',
  },
]

test('formats the model catalog as a readable table', () => {
  expect(formatFreebuffModelCatalogTable(catalog)).toBe(
    [
      'Freebuff models (1)',
      '| ID            | NAME          | AVAILABILITY     | ACCESS  | INPUT        | DATA USE  | DESCRIPTION                                      |',
      '|---------------|---------------|------------------|---------|--------------|-----------|--------------------------------------------------|',
      '| example/model | Example Model | Deployment hours | Premium | Text + image | May train | Fast coding model (May use data for AI training) |',
      '',
    ].join('\n'),
  )
})

test('lists only standing CLI picker models', () => {
  expect(getFreebuffModelCatalog().map((model) => model.id)).toEqual(
    FREEBUFF_MODELS.map((model) => model.id),
  )
  expect(getFreebuffModelCatalog().map((model) => model.id)).not.toContain(
    FREEBUFF_GEMINI_38_FLASH_MODEL_ID,
  )
  expect(getFreebuffModelCatalog().map((model) => model.id)).not.toContain(
    FREEBUFF_FABLE_5_MODEL_ID,
  )
})
