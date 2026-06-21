import { Button as HeroButton } from '@heroui/react'

export type ButtonType =
  | 'primary'
  | 'critical'
  | 'success'
  | 'warning'
  | 'info'
  | 'default'
  | 'ghost'

const variantMap: Record<string, 'danger' | 'secondary' | 'tertiary' | 'outline' | 'ghost'> = {
  critical: 'danger',
  default: 'secondary',
  primary: 'tertiary',
  info: 'secondary',
  success: 'secondary',
  warning: 'secondary',
  ghost: 'ghost',
}

export const Button = (props: {
  children: any
  size?: 'sm' | 'md' | 'lg'
  onClick?: any
  type?: ButtonType
  isDisabled?: boolean
}) => {
  return (
    <HeroButton
      isDisabled={props.isDisabled}
      onPress={props.onClick}
      variant={variantMap[props.type || 'default'] || 'secondary'}
      size={props.size || 'md'}
    >
      {props.children}
    </HeroButton>
  )
}
