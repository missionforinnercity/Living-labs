// Script to increase walking times by 35%
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.join(__dirname, '../data/walkabilty/roads_with_walking_times.geojson');

console.log('Reading walking times data...');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log(`Processing ${data.features.length} features...`);

// Multiply all walking times by 1.35 (increase by 35%)
let modifiedCount = 0;
data.features.forEach(feature => {
  if (feature.properties.walk_time_bus !== null && feature.properties.walk_time_bus !== undefined) {
    feature.properties.walk_time_bus *= 1.35;
    modifiedCount++;
  }
  if (feature.properties.walk_time_train !== null && feature.properties.walk_time_train !== undefined) {
    feature.properties.walk_time_train *= 1.35;
  }
});

console.log(`Modified ${modifiedCount} features`);
console.log('Writing updated data...');
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

console.log('✓ Walking times increased by 35%');
