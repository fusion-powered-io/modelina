import { JavaRenderer } from '../JavaRenderer';
import {
  ConstrainedDictionaryModel,
  ConstrainedMetaModel,
  ConstrainedObjectModel,
  ConstrainedObjectPropertyModel,
  ConstrainedUnionModel
} from '../../../models';
import { FormatHelpers } from '../../../helpers';
import { JavaOptions } from '../JavaGenerator';
import { ClassPresetType } from '../JavaPreset';
import { unionIncludesBuiltInTypes } from '../JavaConstrainer';

/**
 * Renderer for Java's `class` type
 *
 * @extends JavaRenderer
 */
export class ClassRenderer extends JavaRenderer<ConstrainedObjectModel> {
  async defaultSelf(): Promise<string> {
    const content = [
      await this.renderProperties(),
      await this.runCtorPreset(),
      await this.renderAccessors(),
      await this.runAdditionalContentPreset()
    ];

    if (this.options?.collectionType === 'List') {
      this.dependencyManager.addDependency('import java.util.List;');
    }
    if (this.model.containsPropertyType(ConstrainedDictionaryModel)) {
      this.dependencyManager.addDependency('import java.util.Map;');
    }

    const parentClass = getParentClass(this.model);
    const parentInterfaces = getParentInterfaces(this.model);

    if (!parentClass && parentInterfaces.length === 0) {
      return `public class ${this.model.name} {
${this.indent(this.renderBlock(content, 2))}
}`;
    }

    let extension = '';
    if (parentClass) {
      this.dependencyManager.addModelDependency(parentClass);
      extension = ` extends ${parentClass.name}`;
    }

    let implementations = '';
    if (parentInterfaces.length > 0) {
      const interfaces = parentInterfaces
        .map(parentInterface => {
          this.dependencyManager.addModelDependency(parentInterface);
          return parentInterface.name;
        })
        .join(', ');
      implementations = ` implements ${interfaces}`;
    }

    return `public class ${this.model.name}${extension}${implementations} {
${this.indent(this.renderBlock(content, 2))}
}`;
  }

  runCtorPreset(): Promise<string> {
    return this.runPreset('ctor');
  }

  /**
   * Render all the properties for the class.
   */
  async renderProperties(): Promise<string> {
    const properties = this.model.properties || {};
    const content: string[] = [];

    for (const property of Object.values(properties)) {
      const rendererProperty = await this.runPropertyPreset(property);
      content.push(rendererProperty);
    }

    return this.renderBlock(content);
  }

  runPropertyPreset(property: ConstrainedObjectPropertyModel): Promise<string> {
    return this.runPreset('property', { property });
  }

  /**
   * Render all the accessors for the properties
   */
  async renderAccessors(): Promise<string> {
    const properties = this.model.properties || {};
    const content: string[] = [];

    for (const property of Object.values(properties)) {
      const getter = await this.runGetterPreset(property);
      const setter = await this.runSetterPreset(property);
      content.push(this.renderBlock([getter, setter]));
    }

    return this.renderBlock(content, 2);
  }

  runGetterPreset(property: ConstrainedObjectPropertyModel): Promise<string> {
    return this.runPreset('getter', { property });
  }

  runSetterPreset(property: ConstrainedObjectPropertyModel): Promise<string> {
    return this.runPreset('setter', { property });
  }

}

export const JAVA_DEFAULT_CLASS_PRESET: ClassPresetType<JavaOptions> = {
  self({ renderer }) {
    return renderer.defaultSelf();
  },
  property({ property }) {
    if (property.property.options.const?.value) {
      return `private final ${property.property.type} ${property.propertyName} = ${property.property.options.const.value};`;
    }

    if(property.required && property.property.originalInput.type === 'array') {
      return `private ${property.property.type} ${property.propertyName} = List.of();`
    }

    if(property.property.originalInput.default) {
      if(property.property.originalInput.enum) {
        return `private ${property.property.type} ${property.propertyName} = ${property.property.type}.${property.property.originalInput.default};`;
      }

      return `private ${property.property.type} ${property.propertyName} = ${property.property.originalInput.default};`;
    }

    return `private ${property.property.type} ${property.propertyName};`;
  },
  getter({ property }) {
    const getterName = `get${FormatHelpers.toPascalCase(property.propertyName)}`;

    return `public ${property.property.type} ${getterName}() { return this.${property.propertyName}; }`;
  },
  setter({ property, model }) {
    if (property.property.options.const?.value) {
      return '';
    }

    const setterMethods: string[] = [];

    const pascalCaseName = FormatHelpers.toPascalCase(property.propertyName);
    setterMethods.push(`public void set${pascalCaseName}(${property.property.type} ${property.propertyName}) { this.${property.propertyName} = ${property.propertyName}; }`);
    setterMethods.push(`public ${model.name} ${property.propertyName}(${property.property.type} ${property.propertyName}) { this.${property.propertyName} = ${property.propertyName}; return this; }`);

    if(property.property.originalInput.type === 'array') {
      const listType = property.property.type;
      const itemType = listType.substring(listType.indexOf("<") + 1, listType.lastIndexOf(">"))
      const itemName = `${property.propertyName}Item`;
      setterMethods.push(`public ${model.name} add${pascalCaseName}Item(${itemType} ${itemName}) {
if (this.${property.propertyName} == null) {
  this.${property.propertyName} = List.of();
}

this.${property.propertyName}.add(${itemName});
return this;
}`);
    }

    return setterMethods.join('\n');
  }
};

function getParentInterfaces(model: ConstrainedMetaModel): ConstrainedUnionModel[] {
  if (!model.options.parents) {
    return [];
  }

  return model.options.parents
    .filter(parent => parent instanceof ConstrainedUnionModel && !unionIncludesBuiltInTypes(parent))
    .map(model => model as ConstrainedUnionModel);
}

function getParentClass(model: ConstrainedMetaModel): ConstrainedObjectModel | undefined {
  const parent = model.options.extend
    ?.find(parent => parent.options.isExtended);
  return parent ? parent as ConstrainedObjectModel : undefined;
}

export const isDiscriminatorOrDictionary = (
  model: ConstrainedObjectModel,
  property: ConstrainedObjectPropertyModel
): boolean =>
  model.options.discriminator?.discriminator ===
  property.unconstrainedPropertyName ||
  property.property instanceof ConstrainedDictionaryModel;
