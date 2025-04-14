import {
  ConstrainedDictionaryModel,
  ConstrainedMetaModel,
  ConstrainedMetaModelOptionsDiscriminator,
  ConstrainedObjectModel,
  ConstrainedReferenceModel
} from '../../../models';
import { JavaPreset } from '../JavaPreset';

const JACKSON_ANNOTATION_DEPENDENCY =
  'import com.fasterxml.jackson.annotation.*;';

/**
 * Preset which adds `com.fasterxml.jackson` related annotations to class's property getters.
 *
 * @implements {JavaPreset}
 */
export const JAVA_JACKSON_PRESET: JavaPreset = {
  class: {
    self({ renderer, content, model }) {
      renderer.dependencyManager.addDependency(JACKSON_ANNOTATION_DEPENDENCY);
      const blocks: string[] = [];

      if (model.properties) {
        const propertyNames = Object.values(model.properties)
          .map(property => `  "${property.propertyName}"`)
          .join(',\n');
        blocks.push(
          renderer.renderAnnotation('JsonPropertyOrder', `{\n${propertyNames}\n}`)
        );
      }
      const discriminator = findDiscriminator(model);

      if (discriminator) {
        blocks.push(
          renderer.renderAnnotation('JsonIgnoreProperties', {
            value: `"${discriminator.discriminator}"`,
            allowSetters: 'true'
          })
        );
        blocks.push(
          renderer.renderAnnotation('JsonTypeInfo', {
            use: 'JsonTypeInfo.Id.NAME',
            include: 'JsonTypeInfo.As.PROPERTY',
            property: `"${discriminator.discriminator}"`,
            visible: 'true'
          })
        );
      }

      const types = (model.options.implementedBy ?? [])
        ?.flatMap(implementation => getAllImplementations(implementation))
        .map((implementation) => {
          return `  @JsonSubTypes.Type(value = ${implementation.name}.class, name = "${implementation.name}")`;
        })
        .join(',\n');

      if (types && types.length > 0) {
        if(discriminator === undefined) {
          blocks.push(
            renderer.renderAnnotation('JsonTypeInfo', {
              use: 'JsonTypeInfo.Id.DEDUCTION'
            })
          );
        }
        blocks.push(
          renderer.renderAnnotation('JsonSubTypes', `{\n${types}\n}`)
        );
      }

      return renderer.renderBlock([...blocks, content]);
    },
    property({ renderer, property, content, model }) {

      //Properties that are dictionaries with unwrapped options, cannot get the annotation because it cannot be accurately unwrapped by the jackson library.
      const isDictionary =
        property.property instanceof ConstrainedDictionaryModel;
      const hasUnwrappedOptions =
        isDictionary && (property.property as ConstrainedDictionaryModel).serializationType === 'unwrap';

      const blocks: string[] = [];

      if (hasUnwrappedOptions) {
        blocks.push(renderer.renderAnnotation('JsonAnySetter'));
        if (!property.required) {
          blocks.push(
            renderer.renderAnnotation(
              'JsonInclude',
              'JsonInclude.Include.NON_NULL'
            )
          );
        }

        blocks.push(content);

        return renderer.renderBlock(blocks);
      }

      blocks.push(
        renderer.renderAnnotation(
          'JsonProperty',
          `"${property.unconstrainedPropertyName}"`
        )
      );

      blocks.push(
        renderer.renderAnnotation(
          'JsonInclude',
          property.required && property.propertyName !== findDiscriminator(model)?.discriminator ? 'JsonInclude.Include.NON_NULL' : 'JsonInclude.Include.USE_DEFAULTS'
        )
      );

      blocks.push(content);

      return renderer.renderBlock(blocks);
    },
    getter({ renderer, property, content }) {
      //Properties that are dictionaries with unwrapped options, cannot get the annotation because it cannot be accurately unwrapped by the jackson library.
      const isDictionary =
        property.property instanceof ConstrainedDictionaryModel;
      const hasUnwrappedOptions =
        isDictionary &&
        (property.property as ConstrainedDictionaryModel).serializationType ===
        'unwrap';
      const blocks: string[] = [];
      if (hasUnwrappedOptions) {
        blocks.push(renderer.renderAnnotation('JsonAnyGetter'));
      }
      blocks.push(content);
      return renderer.renderBlock(blocks);
    }
  },
  enum: {
    self({ renderer, content }) {
      renderer.dependencyManager.addDependency(JACKSON_ANNOTATION_DEPENDENCY);
      return content;
    },
    getValue({ content }) {
      return `@JsonValue
${content}`;
    },
    fromValue({ content }) {
      return `@JsonCreator
${content}`;
    }
  },
  union: {
    self({ renderer, content, model }) {
      renderer.dependencyManager.addDependency(JACKSON_ANNOTATION_DEPENDENCY);

      const blocks: string[] = [];

      if (model.options.discriminator) {
        const { discriminator } = model.options;
        blocks.push(
          renderer.renderAnnotation('JsonTypeInfo', {
            use: 'JsonTypeInfo.Id.NAME',
            include: 'JsonTypeInfo.As.EXISTING_PROPERTY',
            property: `"${discriminator.discriminator}"`,
            visible: 'true'
          })
        );

        const types = model.union
          .map((union) => {
            if (
              union instanceof ConstrainedReferenceModel &&
              union.ref instanceof ConstrainedObjectModel
            ) {
              const discriminatorProp = Object.values(
                union.ref.properties
              ).find(
                (model) =>
                  model.unconstrainedPropertyName ===
                  discriminator.discriminator
              );

              if (discriminatorProp?.property.options.const) {
                return `  @JsonSubTypes.Type(value = ${union.name}.class, name = "${discriminatorProp.property.options.const.originalInput}")`;
              }
            }

            return `  @JsonSubTypes.Type(value = ${union.name}.class, name = "${union.name}")`;
          })
          .join(',\n');

        blocks.push(
          renderer.renderAnnotation('JsonSubTypes', `{\n${types}\n}`)
        );
      } else {
        blocks.push(
          renderer.renderAnnotation('JsonTypeInfo', {
            use: 'JsonTypeInfo.Id.DEDUCTION'
          })
        );

        const types = model.union
          .map(
            (union) =>
              `  @JsonSubTypes.Type(value = ${union.name}.class, name = "${union.name}")`
          )
          .join(',\n');

        blocks.push(
          renderer.renderAnnotation('JsonSubTypes', `{\n${types}\n}`)
        );
      }

      return renderer.renderBlock([...blocks, content]);
    }
  }
};

function getAllImplementations(model: ConstrainedMetaModel): ConstrainedMetaModel[] {
  if (model.options.implementedBy && model.options.implementedBy.length > 0) {
    return [model, ...model.options.implementedBy.flatMap(implementation => getAllImplementations(implementation))];
  } else {
    return [model];
  }
}

function findDiscriminator(model: ConstrainedMetaModel): ConstrainedMetaModelOptionsDiscriminator | undefined {
  if (model.options.discriminator) {
    return model.options.discriminator;
  } else if (model.options.extend) {
    const parent = model.options.extend?.find(parent => parent.options.isExtended);
    return parent ? findDiscriminator(parent) : undefined;
  }
}
