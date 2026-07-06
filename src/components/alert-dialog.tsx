import {
  AlertDialog as HeroAlertDialog,
  AlertDialogIconProps as HeroAlertDialogIconProps,
  AlertDialogProps as HeroAlertDialogProps,
  Button,
} from '@heroui/react'
import { createGlobalState } from 'react-use'

interface AlertDialogProps {
  status?: HeroAlertDialogIconProps['status']
  isOpen?: HeroAlertDialogProps['isOpen']
  onOpenChange?: HeroAlertDialogProps['onOpenChange']
  title?: string
  message?: React.ReactNode
  cancelText?: string
  okText?: string
  onOk?: () => void
  onCancel?: () => void
}

export function AlertDialog({
  status,
  title,
  message,
  cancelText,
  okText,
  onOk,
  onCancel,
  isOpen,
  onOpenChange,
}: AlertDialogProps) {
  return (
    <HeroAlertDialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <HeroAlertDialog.Backdrop>
        <HeroAlertDialog.Container>
          <HeroAlertDialog.Dialog>
            <HeroAlertDialog.CloseTrigger />
            <HeroAlertDialog.Header>
              <HeroAlertDialog.Icon status={status} />
              <HeroAlertDialog.Heading>{title}</HeroAlertDialog.Heading>
            </HeroAlertDialog.Header>

            <HeroAlertDialog.Body>{message}</HeroAlertDialog.Body>

            <HeroAlertDialog.Footer>
              <Button
                slot="close"
                variant="tertiary"
                onPress={() => {
                  onCancel?.()
                }}
              >
                {cancelText}
              </Button>
              {okText && (
                <Button
                  slot="close"
                  variant={status === 'danger' ? 'danger' : 'primary'}
                  onPress={() => {
                    onOpenChange?.(false)
                    onOk?.()
                  }}
                >
                  {okText}
                </Button>
              )}
            </HeroAlertDialog.Footer>
          </HeroAlertDialog.Dialog>
        </HeroAlertDialog.Container>
      </HeroAlertDialog.Backdrop>
    </HeroAlertDialog>
  )
}

type AlertProviderProps = Omit<AlertDialogProps, 'isOpen' | 'onOpenChange'>
const useAlertDialogValue = createGlobalState<AlertProviderProps | null>()
export function useAlertDialog() {
  const [alertValue, setAlertValue] = useAlertDialogValue()

  return (props: AlertProviderProps) => {
    if (alertValue) {
      return
    }

    setAlertValue(props)
  }
}
export function AlertDialogProvider() {
  const [alertValue, setAlertValue] = useAlertDialogValue()

  return (
    <AlertDialog
      {...alertValue}
      isOpen={!!alertValue}
      onOpenChange={() => {
        setAlertValue(null)
      }}
    />
  )
}
