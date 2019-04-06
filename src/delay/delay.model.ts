import {Method} from '..';

export type Delayable = (target: any,
                         propertyName: string,
                         descriptor: TypedPropertyDescriptor<Method<any>>) => TypedPropertyDescriptor<Method<any>>;