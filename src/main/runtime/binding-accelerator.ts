import { acceleratorString, bindingById, type BindingId } from '../../shared/bindings'

export function acceleratorFor(id: BindingId): string {
  return acceleratorString(bindingById(id).defaultKey)
}
