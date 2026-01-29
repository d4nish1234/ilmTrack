import React, { ReactNode } from 'react';
import {
  StyleSheet,
  View,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { TextInput, HelperText } from 'react-native-paper';
import { Control, Controller, FieldValues, Path } from 'react-hook-form';

interface InputProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: 'email' | 'password' | 'name' | 'off';
  multiline?: boolean;
  numberOfLines?: number;
  disabled?: boolean;
  returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send' | 'default';
}

export function Input<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  secureTextEntry,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  autoComplete = 'off',
  multiline = false,
  numberOfLines = 1,
  disabled = false,
  returnKeyType = 'done',
}: InputProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({
        field: { onChange, onBlur, value },
        fieldState: { error },
      }) => (
        <View style={styles.container}>
          <TextInput
            label={label}
            placeholder={placeholder}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            mode="outlined"
            secureTextEntry={secureTextEntry}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            autoComplete={autoComplete}
            multiline={multiline}
            numberOfLines={numberOfLines}
            disabled={disabled}
            error={!!error}
            style={styles.input}
            returnKeyType={multiline ? undefined : returnKeyType}
          />
          {error && (
            <HelperText type="error" visible={!!error}>
              {error.message}
            </HelperText>
          )}
        </View>
      )}
    />
  );
}

// Wrapper component that dismisses keyboard when tapping outside inputs
interface DismissKeyboardViewProps {
  children: ReactNode;
}

export function DismissKeyboardView({ children }: DismissKeyboardViewProps) {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.dismissContainer}>{children}</View>
    </TouchableWithoutFeedback>
  );
}

// Empty component for backwards compatibility - InputAccessoryView doesn't work reliably in Expo Go
export function KeyboardAccessory() {
  return null;
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
  },
  dismissContainer: {
    flex: 1,
  },
});
