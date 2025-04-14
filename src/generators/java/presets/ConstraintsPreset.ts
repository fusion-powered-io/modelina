import {
  ConstrainedArrayModel,
  ConstrainedFloatModel,
  ConstrainedIntegerModel, ConstrainedMetaModel, ConstrainedMetaModelOptionsDiscriminator,
  ConstrainedObjectModel,
  ConstrainedReferenceModel,
  ConstrainedStringModel
} from '../../../models';
import { JavaPreset } from '../JavaPreset';

export interface JavaConstraintsPresetOptions {
  useJakarta: false;
}
/**
 * Preset which extends class's getters with annotations from `javax.validation.constraints` package
 *
 * @implements {JavaPreset}
 */
export const JAVA_CONSTRAINTS_PRESET: JavaPreset<JavaConstraintsPresetOptions> =
  {
    class: {
      self({ renderer, content, options }) {
        options = options || { useJakarta: false };
        const importFrom = options.useJakarta ? 'jakarta' : 'javax';
        renderer.dependencyManager.addDependency(
          `import ${importFrom}.validation.constraints.*;`
        );
        renderer.dependencyManager.addDependency(`import ${importFrom}.validation.Valid;`);
        return content;
      },
      // eslint-disable-next-line sonarjs/cognitive-complexity
      property({ renderer, property, content, model }) {
        const annotations: string[] = [];

        // needs cascade validation
        if (
          property.property instanceof ConstrainedReferenceModel ||
          property.property instanceof ConstrainedObjectModel ||
          property.property instanceof ConstrainedArrayModel
        ) {
          annotations.push(renderer.renderAnnotation('Valid'));
        }

        const discriminator = findDiscriminator(model);
        if (property.required && property.propertyName !== discriminator?.discriminator) {
          annotations.push(renderer.renderAnnotation('NotNull'));
        }
        const originalInput = property.property.originalInput;

        // string
        if (property.property instanceof ConstrainedStringModel) {
          const pattern = originalInput['pattern'];
          if (pattern !== undefined) {
            annotations.push(
              renderer.renderAnnotation('Pattern', {
                regexp: renderer.renderStringLiteral(pattern)
              })
            );
          }
          const minLength = originalInput['minLength'];
          const maxLength = originalInput['maxLength'];
          if (minLength !== undefined || maxLength !== undefined) {
            annotations.push(
              renderer.renderAnnotation('Size', {
                min: minLength,
                max: maxLength
              })
            );
          }
        }

        // number/integer
        if (
          property.property instanceof ConstrainedFloatModel ||
          property.property instanceof ConstrainedIntegerModel
        ) {
          const minimum = originalInput['minimum'];
          if (minimum !== undefined) {
            annotations.push(renderer.renderAnnotation('Min', minimum));
          }
          const exclusiveMinimum = originalInput['exclusiveMinimum'];
          if (exclusiveMinimum !== undefined) {
            annotations.push(
              renderer.renderAnnotation('Min', exclusiveMinimum + 1)
            );
          }
          const maximum = originalInput['maximum'];
          if (maximum !== undefined) {
            annotations.push(renderer.renderAnnotation('Max', maximum));
          }
          const exclusiveMaximum = originalInput['exclusiveMaximum'];
          if (exclusiveMaximum !== undefined) {
            annotations.push(
              renderer.renderAnnotation('Max', exclusiveMaximum - 1)
            );
          }
        }

        // array
        if (property.property instanceof ConstrainedArrayModel) {
          const minItems = originalInput['minItems'];
          const maxItems = originalInput['maxItems'];
          if (minItems !== undefined || maxItems !== undefined) {
            annotations.push(
              renderer.renderAnnotation('Size', {
                min: minItems,
                max: maxItems
              })
            );
          }
        }

        return renderer.renderBlock([...annotations, content]);
      }
    }
  };

function findDiscriminator(model: ConstrainedMetaModel): ConstrainedMetaModelOptionsDiscriminator | undefined {
  if (model.options.discriminator) {
    return model.options.discriminator;
  } else if (model.options.extend) {
    const parent = model.options.extend?.find(parent => parent.options.isExtended);
    return parent ? findDiscriminator(parent) : undefined;
  }
}
