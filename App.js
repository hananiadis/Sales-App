import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, Button, PermissionsAndroid } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';

const mockProducts = [
  { code: '001', name: 'Toy Car', description: 'Small red toy car' },
  { code: '002', name: 'Marker Set', description: '12-color marker set' },
];

export default function App() {
  const [products, setProducts] = useState(mockProducts);
  const [quantities, setQuantities] = useState({});
  const [customer, setCustomer] = useState({ store: '', vat: '', notes: '' });
  const [location, setLocation] = useState(null);

  const handleQuantityChange = (code, qty) => {
    setQuantities({ ...quantities, [code]: qty });
  };

  const getLocation = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    let loc = await Location.getCurrentPositionAsync({});
    setLocation(loc.coords);
  };

  useEffect(() => { getLocation(); }, []);

  const exportCSV = async () => {
    const rows = products.map(p => `${p.code},${p.name},${quantities[p.code] || 0}`);
    rows.unshift('Code,Name,Quantity');
    rows.push(`Store:,${customer.store}`);
    rows.push(`VAT:,${customer.vat}`);
    rows.push(`Notes:,${customer.notes}`);
    if (location) {
      rows.push(`Latitude:,${location.latitude}`);
      rows.push(`Longitude:,${location.longitude}`);
    }
    const csv = rows.join("\n");
    const path = FileSystem.documentDirectory + "order.csv";
    await FileSystem.writeAsStringAsync(path, csv);
    alert("CSV Exported: " + path);
  };

  return (
    <View style={{ padding: 20 }}>
      <Text>Store Name:</Text>
      <TextInput onChangeText={text => setCustomer({ ...customer, store: text })} />
      <Text>VAT Number:</Text>
      <TextInput onChangeText={text => setCustomer({ ...customer, vat: text })} />
      <Text>Notes:</Text>
      <TextInput onChangeText={text => setCustomer({ ...customer, notes: text })} />
      <FlatList
        data={products}
        keyExtractor={item => item.code}
        renderItem={({ item }) => (
          <View>
            <Text>{item.code} - {item.name}</Text>
            <TextInput
              keyboardType='numeric'
              onChangeText={text => handleQuantityChange(item.code, text)}
              placeholder="Qty"
            />
          </View>
        )}
      />
      <Button title="Export CSV" onPress={exportCSV} />
    </View>
  );
}